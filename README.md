# Ausgleichsfläche near me

A modern web application to find the nearest Ausgleichsflächen (compensation areas) in northern Germany using spatial indexing and interactive mapping.

## Features

- 🗺️ **Interactive Map**: Satellite imagery with restricted bounds to northern Germany
- 🔍 **Spatial Search**: Fast spatial indexing with Flatbush for efficient nearest neighbor queries
- 📍 **Click to Search**: Click anywhere on the map or search by address
- 🎨 **Modern UI**: Glassmorphism design with smooth scroll snapping
- 📊 **Detailed Info**: Modal overlays showing polygon properties
- 🇩🇪 **German Interface**: Fully localized for German users

## Technology Stack

- **Frontend**: Svelte 5 with Vite
- **Mapping**: Leaflet with Esri satellite imagery
- **Spatial Index**: Flatbush for fast polygon searches
- **Geometry**: Turf.js for distance calculations
- **Styling**: Modern CSS with glassmorphism effects

## Data

The application uses MultiPolygon GeoJSON data with a pre-built spatial index for fast searching. The spatial index covers northern Germany (approximately 53.36-55.05°N, 8.29-11.30°E).

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Deployment

This application is optimized for deployment on Vercel or similar static hosting platforms.
