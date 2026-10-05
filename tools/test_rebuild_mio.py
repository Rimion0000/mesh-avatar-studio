# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow>=10.4", "opencv-python-headless"]
# ///
"""Test Mio's private input handling, occlusion mask and rebuild rollback."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("rebuild_mio", ROOT / "tools/rebuild-mio.py")
mio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mio)


class RebuildMioTest(unittest.TestCase):
    def setUp(self):
        (ROOT / "projects").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix=".mio-test-", dir=ROOT / "projects")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.settings = {
            "image": {"width": 16, "height": 12},
            "parts": {name: f"mio_{name}.png" for name in mio.PARTS},
            "compositeOrder": list(mio.PARTS),
            "hairMask": {
                "bodyOcclusionAlpha": 20,
                "frontHairOnBodyMinAlpha": 200,
                "headAccessoryPolygon": [[10, 8], [14, 8], [14, 10], [10, 10]],
            },
        }
        self.parts = {name: Image.new("RGBA", (16, 12)) for name in mio.PARTS}
        for name, image in self.parts.items():
            image.save(self.root / self.settings["parts"][name])

    def test_composition_preserves_original_order_and_invisible_back_pixels(self):
        self.parts["back_hair"].putpixel((1, 1), (230, 230, 255, 255))
        self.parts["body"].putpixel((1, 1), (250, 220, 200, 255))
        self.parts["front_hair"].putpixel((1, 1), (150, 180, 230, 128))
        self.parts["back_hair"].putpixel((2, 2), (10, 20, 30, 0))
        expected = Image.alpha_composite(Image.alpha_composite(self.parts["back_hair"], self.parts["body"]), self.parts["front_hair"])
        before = {name: image.tobytes() for name, image in self.parts.items()}
        self.assertEqual(mio.composite_parts(self.parts, self.settings).tobytes(), expected.tobytes())
        self.assertEqual({name: image.tobytes() for name, image in self.parts.items()}, before)

    def test_alpha_mask_excludes_body_and_ornament_without_using_white_colour(self):
        self.parts["back_hair"] = Image.new("RGBA", (16, 12), (255, 255, 255, 255))
        self.parts["body"].putpixel((2, 2), (255, 255, 255, 255))
        self.parts["body"].putpixel((3, 2), (240, 210, 200, 255))
        self.parts["front_hair"].putpixel((2, 2), (255, 255, 255, 150))
        self.parts["front_hair"].putpixel((3, 2), (255, 255, 255, 220))
        mask = mio.exact_hair_mask(self.parts, self.settings)
        self.assertEqual(int(mask[2, 2]), 0)
        self.assertEqual(int(mask[2, 3]), 220)
        self.assertEqual(int(mask[4, 4]), 255)
        self.assertEqual(int(mask[9, 12]), 0)

    def test_missing_wrong_sized_or_opaque_inputs_leave_files_unchanged(self):
        paths = list(self.root.glob("*.png"))
        original = {path: path.read_bytes() for path in paths}
        mio.read_parts(self.root, self.settings)
        self.assertEqual({path: path.read_bytes() for path in paths}, original)
        missing = self.root / "mio_body.png"
        missing.unlink()
        with self.assertRaisesRegex(ValueError, "Missing"):
            mio.read_parts(self.root, self.settings)
        Image.new("RGBA", (15, 12)).save(missing)
        with self.assertRaisesRegex(ValueError, "expected PNG"):
            mio.read_parts(self.root, self.settings)
        Image.new("RGB", (16, 12)).save(missing)
        with self.assertRaisesRegex(ValueError, "transparency"):
            mio.read_parts(self.root, self.settings)

    def test_private_output_and_existing_source_are_protected(self):
        with self.assertRaisesRegex(ValueError, "inside"):
            mio.private_project(ROOT / "configs/mio")
        with self.assertRaisesRegex(ValueError, "inside"):
            mio.private_project(ROOT / "projects")
        output = self.root / "existing"
        output.mkdir()
        source = output / "source.png"
        Image.new("RGBA", (16, 12), (10, 20, 30, 255)).save(source)
        before = source.read_bytes()
        with patch.object(mio, "read_parts", return_value=self.parts), patch.object(mio, "composite_parts", return_value=Image.new("RGBA", (16, 12))), patch.object(mio, "prepare_tools") as install:
            with self.assertRaisesRegex(ValueError, "differs"):
                mio.rebuild(output, self.root)
            install.assert_not_called()
        self.assertEqual(source.read_bytes(), before)

    def test_failed_build_preserves_local_edits_and_private_files(self):
        output = self.root / "existing"
        output.mkdir()
        rig = output / "rig.json"
        rig.write_text('{"local": "edit"}')
        note = output / "my-note.txt"
        note.write_text("keep me")
        before = {path.name: path.read_bytes() for path in output.iterdir()}
        with patch.object(mio, "read_parts", return_value=self.parts), patch.object(mio, "composite_parts", return_value=Image.new("RGBA", (16, 12))), patch.object(mio, "exact_hair_mask", return_value=np.zeros((12, 16), np.uint8)), patch.object(mio, "prepare_tools", return_value="node"), patch.object(mio, "validate_rig", side_effect=ValueError("invalid local rig")):
            with self.assertRaisesRegex(ValueError, "invalid local rig"):
                mio.rebuild(output, self.root)
        self.assertEqual({path.name: path.read_bytes() for path in output.iterdir()}, before)
        self.assertEqual(list(self.root.glob(".mio-rebuild-*")), [])

    def test_failed_publish_rolls_back_before_replacing_existing_project(self):
        output = self.root / "existing"
        output.mkdir()
        (output / "keep.txt").write_text("original")
        stage = self.root / "stage"
        stage.mkdir()
        (stage / "keep.txt").write_text("new")
        rename = Path.rename

        def fail_stage(path, target):
            if path == stage:
                raise PermissionError("locked folder")
            return rename(path, target)

        with patch.object(Path, "rename", fail_stage):
            with self.assertRaises(PermissionError):
                mio.publish_project(stage, output)
        self.assertEqual((output / "keep.txt").read_text(), "original")
        self.assertEqual(list(self.root.glob(".mio-backup-*")), [])
        mio.publish_project(stage, output)
        self.assertEqual((output / "keep.txt").read_text(), "new")


if __name__ == "__main__":
    unittest.main()
