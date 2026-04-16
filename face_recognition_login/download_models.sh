#!/usr/bin/env bash

set -e

MODELS_DIR="static/src/models"
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

mkdir -p "$MODELS_DIR"

for f in \
  tiny_face_detector_model-shard1 \
  tiny_face_detector_model-weights_manifest.json \
  face_landmark_68_tiny_model-shard1 \
  face_landmark_68_tiny_model-weights_manifest.json \
  face_recognition_model-shard1 \
  face_recognition_model-shard2 \
  face_recognition_model-weights_manifest.json; do
    curl -fsSL -o "$MODELS_DIR/$f" "$BASE_URL/$f"
done
