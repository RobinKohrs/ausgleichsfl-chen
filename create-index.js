const Flatbush = require("flatbush").default;
const fs = require("fs");

console.log("Starting preprocessing...");

// --- CONFIGURATION ---
// 1. Set the path to your source GeoJSON file.
const GEOJSON_INPUT_PATH = "./af_sh.geojson";

// 2. Define the output file names. These will be placed in the 'public' folder.
const INDEX_OUTPUT_PATH = "./public/af_sh.idx";
const DATA_OUTPUT_PATH = "./public/af_sh.json";
// --- END CONFIGURATION ---

/**
 * Calculates the bounding box of a GeoJSON polygon or multipolygon.
 * Handles both Polygon and MultiPolygon structures.
 * @param {number[][][]|number[][][][]} coordinates - The coordinates array from a GeoJSON geometry.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
function getBoundingBox(coordinates) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  // Handle MultiPolygon: coordinates is an array of polygons
  // Handle Polygon: coordinates is a single polygon
  let polygons;
  try {
    // Check if first coordinate is an array of arrays (MultiPolygon)
    if (
      coordinates[0] &&
      coordinates[0][0] &&
      Array.isArray(coordinates[0][0][0])
    ) {
      polygons = coordinates; // MultiPolygon
    } else {
      polygons = [coordinates]; // Polygon
    }
  } catch (e) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  for (const polygon of polygons) {
    // The first element of each polygon is the outer ring
    const ring = polygon[0];
    if (!ring) continue;

    for (const [lon, lat] of ring) {
      if (lon < minX) minX = lon;
      if (lat < minY) minY = lat;
      if (lon > maxX) maxX = lon;
      if (lat > maxY) maxY = lat;
    }
  }

  // Return zero bounds if no valid coordinates found
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  return { minX, minY, maxX, maxY };
}

try {
  // Step 1: Load your raw polygon data
  if (!fs.existsSync(GEOJSON_INPUT_PATH)) {
    throw new Error(`Input file not found at: ${GEOJSON_INPUT_PATH}`);
  }
  const geojsonData = JSON.parse(fs.readFileSync(GEOJSON_INPUT_PATH, "utf8"));
  const features = geojsonData.features;

  if (!features || features.length === 0) {
    throw new Error("No features found in the GeoJSON file.");
  }

  // Step 2: Create a new Flatbush index (we'll adjust size later)
  const index = new Flatbush(features.length);

  // Step 3: Populate the index with the bounding box of each polygon
  console.log(`Processing ${features.length} polygons...`);
  let validPolygons = 0;
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (feature.geometry && feature.geometry.coordinates) {
      const bbox = getBoundingBox(feature.geometry.coordinates);

      // Debug first few polygons
      if (i < 3) {
        console.log(`Polygon ${i}:`, {
          type: feature.geometry.type,
          coords: feature.geometry.coordinates[0].slice(0, 2),
          bbox: bbox,
        });
      }

      // Only add if bbox is valid
      if (
        bbox.minX !== 0 ||
        bbox.minY !== 0 ||
        bbox.maxX !== 0 ||
        bbox.maxY !== 0
      ) {
        index.add(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
        validPolygons++;
      }
    }
  }
  console.log(`Added ${validPolygons} valid polygons to index`);

  // Step 4: Finalize the index build process
  index.finish();

  // Step 5: Save the output files
  // Ensure the 'public' directory exists
  fs.mkdirSync("./public", { recursive: true });

  // Save the index to a compact binary file
  fs.writeFileSync(INDEX_OUTPUT_PATH, Buffer.from(index.data));
  console.log(`✓ Index file created at: ${INDEX_OUTPUT_PATH}`);

  // Extract just the properties (e.g., name, ID) for each polygon.
  // This keeps the data file small. The order MUST match the index.
  const polygonProperties = features.map((f) => f.properties || {});
  fs.writeFileSync(DATA_OUTPUT_PATH, JSON.stringify(polygonProperties));
  console.log(`✓ Data file created at: ${DATA_OUTPUT_PATH}`);

  console.log("\nPreprocessing complete!");
} catch (error) {
  console.error("An error occurred during preprocessing:", error.message);
}
