import { writeFileSync, mkdirSync } from "node:fs";
// Valid 1x1 PNG fixture for the upload path, not a product photograph.
mkdirSync(".data", { recursive: true });
writeFileSync(
  ".data/qa-upload.png",
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
