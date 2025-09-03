# Ausgleichsflächen Finder

A simple web application to find the nearest Ausgleichsflächen (compensation areas) in Northern Germany.

## Features

- Interactive map with satellite imagery
- Address search with autocomplete suggestions
- Click on map to find nearest areas
- Spatial indexing for fast polygon queries
- Distance calculations using Turf.js
- Responsive design with modern UI

## Technology Stack

- **Frontend**: Plain HTML, CSS, and JavaScript (no frameworks)
- **Mapping**: Leaflet.js with satellite tiles
- **Spatial Data**: Flatbush for spatial indexing
- **Geospatial**: Turf.js for distance calculations
- **Data**: GeoJSON with pre-built spatial index

## Getting Started

1. **Install dependencies**: No build tools required! All libraries are loaded via CDN.

2. **Start the server**:

   ```bash
   npm run dev
   # or
   python3 -m http.server 8000
   ```

3. **Open your browser**: Navigate to `http://localhost:8000`

## Data Files

The app requires these files in the `public/` directory:

- `af_sh.geojson` - GeoJSON data of Ausgleichsflächen
- `af_sh.idx` - Pre-built spatial index
- `af_sh.json` - Properties data

## How It Works

1. **Spatial Index**: Uses Flatbush to create a fast spatial index of all polygons
2. **Search**: When you enter an address or click the map, it finds nearby polygons
3. **Distance Calculation**: Uses Turf.js to calculate precise distances to polygon boundaries
4. **Visualization**: Displays results on an interactive map with different colors

## Browser Compatibility

Works in all modern browsers that support:

- ES6+ JavaScript features
- CSS Grid and Flexbox
- Fetch API
- Web Workers (for spatial indexing)

## Deployment

Simply upload all files to any web server. No build process required!
