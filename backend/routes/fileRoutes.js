
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const File = require("../models/File");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Directory where uploaded files are stored.
const uploadDir = path.join(__dirname, "..", "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

// Allowed file extensions.
const allowedExtensions = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".docx",
]);

// Configure file storage.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName = crypto.randomUUID();
    const extension = path.extname(file.originalname).toLowerCase();

    cb(null, `${uniqueName}${extension}`);
  },
});

// Configure upload restrictions.
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return cb(
        new Error(
          "Unsupported file type. Allowed: PDF, PNG, JPG, TXT, DOCX."
        )
      );
    }

    cb(null, true);
  },
});

// --------------------------------------------------
// POST /api/files/upload
// Upload a file and save its metadata in MongoDB.
// --------------------------------------------------
router.post("/upload", authMiddleware, (req, res) => {
  upload.single("file")(req, res, async (error) => {
    if (error) {
      const isSizeError = error.code === "LIMIT_FILE_SIZE";

      return res.status(isSizeError ? 413 : 400).json({
        message: isSizeError
          ? "File exceeds the 5 MB size limit."
          : error.message || "File upload failed.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please select a file to upload.",
      });
    }

    try {
      const savedFile = await File.create({
        originalName: req.file.originalname,
        storageName: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
        owner: req.user.id,
      });

      return res.status(201).json({
        message: "File uploaded successfully!",
        file: {
          id: savedFile._id,
          originalName: savedFile.originalName,
          size: savedFile.size,
          uploadedAt: savedFile.createdAt,
        },
      });
    } catch (dbError) {
      // Remove the physical file if saving metadata fails.
      await fs.promises.unlink(req.file.path).catch(() => {});

      console.error(
        "Saving file metadata failed:",
        dbError.message
      );

      return res.status(500).json({
        message: "File uploaded, but its record could not be saved.",
      });
    }
  });
});

// --------------------------------------------------
// GET /api/files
// List files belonging to the logged-in user.
// --------------------------------------------------
router.get("/", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      owner: req.user.id,
    })
      .select("originalName storageName size mimeType createdAt")
      .sort({ createdAt: -1 });

    return res.json({ files });
  } catch (error) {
    console.error("Fetching files failed:", error.message);

    return res.status(500).json({
      message: "Could not retrieve your files.",
    });
  }
});

// --------------------------------------------------
// GET /api/files/:id/download
// Download a file after verifying ownership.
// --------------------------------------------------
router.get("/:id/download", authMiddleware, async (req, res) => {
  try {
    // Validate MongoDB ObjectId format.
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({
        message: "Invalid file ID.",
      });
    }

    // Only find files owned by the authenticated user.
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!file) {
      return res.status(404).json({
        message: "File record not found or access denied.",
      });
    }

    // Resolve the stored filename inside the uploads directory.
    const filePath = path.join(uploadDir, file.storageName);

    // Check that the physical file exists.
    try {
      await fs.promises.access(filePath);
    } catch {
      return res.status(404).json({
        message: "The file is missing from server storage.",
      });
    }

    // Send the file to the browser with its original filename.
    return res.download(filePath, file.originalName, (error) => {
      if (error) {
        console.error("Download error:", error.message);

        if (!res.headersSent) {
          res.status(500).json({
            message: "Could not download the file.",
          });
        }
      }
    });
  } catch (error) {
    console.error("Download route error:", error.message);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Server error while downloading the file.",
      });
    }
  }
});

// Export the router AFTER defining all routes.
module.exports = router;
