// Global state management (replaces Svelte's $state)
let state = {
  addressInput: "",
  suggestions: [],
  nearestPolygons: [],
  isLoading: { data: true, search: false },
  selectedPoint: null,
  selectedPolygonData: null,
  currentScrollIndex: 0,
};

// Global variables
let mapInstance;
let geoLayers;
let debounceTimer;
let dataPromise;

// DOM elements
const elements = {
  loadingData: document.getElementById("loading-data"),
  mainContent: document.getElementById("main-content"),
  addressInput: document.getElementById("address-input"),
  suggestionsList: document.getElementById("suggestions-list"),
  resultsContainer: document.getElementById("results-container"),
  resultsScroll: document.getElementById("results-scroll"),
  scrollDots: document.getElementById("scroll-dots"),
  polygonOverlay: document.getElementById("polygon-overlay"),
  polygonDetails: document.getElementById("polygon-details"),
  polygonTitle: document.getElementById("polygon-title"),
  detailsContent: document.getElementById("details-content"),
  closeButton: document.getElementById("close-button"),
  loadingSearch: document.getElementById("loading-search"),
};

// Create a simple white dot marker
const whiteDotIcon = L.divIcon({
  className: "white-dot-marker",
  html: '<div style="width: 20px; height: 20px; background-color: white; border: 3px solid #333; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Configure Leaflet default markers to use our white dot
L.Icon.Default.mergeOptions({
  iconUrl:
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMTAiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMyIvPgo8L3N2Zz4K",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  shadowUrl: "",
  shadowSize: [0, 0],
  shadowAnchor: [0, 0],
});

// Initialize data loading
function initializeData() {
  dataPromise = (async () => {
    const timestamp = Date.now(); // Force cache refresh
    const [idxBuffer, properties] = await Promise.all([
      fetch(`./public/af_sh.idx?t=${timestamp}`).then((res) =>
        res.arrayBuffer()
      ),
      fetch(`./public/af_sh.json?t=${timestamp}`).then((res) => res.json()),
    ]);

    // Load GeoJSON lazily only when needed
    let geojson = null;
    const loadGeojson = async () => {
      if (!geojson) {
        console.log("Loading GeoJSON for distance calculations...");
        geojson = await fetch(`./public/af_sh.geojson?t=${timestamp}`).then(
          (res) => res.json()
        );
      }
      return geojson;
    };

    return {
      index: Flatbush.from(idxBuffer),
      properties,
      loadGeojson,
    };
  })();

  // Wait for data to load and update the loading state
  dataPromise
    .then((data) => {
      console.log(`Spatial index loaded successfully`);
      console.log(
        `Index bounds: [${data.index.minX}, ${data.index.minY}, ${data.index.maxX}, ${data.index.maxY}]`
      );
      state.isLoading.data = false;
      updateUI();
    })
    .catch((error) => {
      console.error("Failed to load spatial data:", error);
      state.isLoading.data = false;
      updateUI();
    });
}

// Update UI based on current state
function updateUI() {
  // Show/hide loading state
  if (state.isLoading.data) {
    elements.loadingData.style.display = "block";
    elements.mainContent.style.display = "none";
  } else {
    elements.loadingData.style.display = "none";
    elements.mainContent.style.display = "block";
  }

  // Update address input
  elements.addressInput.value = state.addressInput;

  // Show/hide suggestions
  if (state.suggestions.length > 0) {
    elements.suggestionsList.style.display = "block";
    elements.suggestionsList.innerHTML = state.suggestions
      .map(
        (s) =>
          `<li onclick="selectAddress(${JSON.stringify(s).replace(
            /"/g,
            "&quot;"
          )})">${s.display_name}</li>`
      )
      .join("");
  } else {
    elements.suggestionsList.style.display = "none";
  }

  // Show/hide results
  if (state.nearestPolygons.length > 0) {
    elements.resultsContainer.style.display = "block";
    renderResults();
  } else {
    elements.resultsContainer.style.display = "none";
  }

  // Show/hide polygon details
  if (state.selectedPolygonData) {
    elements.polygonOverlay.style.display = "block";
    elements.polygonDetails.style.display = "block";
    renderPolygonDetails();
  } else {
    elements.polygonOverlay.style.display = "none";
    elements.polygonDetails.style.display = "none";
  }

  // Show/hide search loading
  elements.loadingSearch.style.display = state.isLoading.search
    ? "block"
    : "none";
}

// Render results cards
function renderResults() {
  const colors = ["tomato", "#ff6b6b", "#ffa500", "#ffb347", "#ffd700"];

  elements.resultsScroll.innerHTML = state.nearestPolygons
    .map(
      (p, index) => `
            <div class="result-card" onclick="showOnMap(${index})">
                <div class="result-info">
                    <span class="result-title">Fläche #${index + 1}</span>
                    <span class="result-distance">${p.distance.toFixed(
                      2
                    )} km</span>
                </div>
                <div class="color-indicator" style="background-color: ${
                  colors[index]
                }"></div>
            </div>
        `
    )
    .join("");

  // Render scroll dots
  elements.scrollDots.innerHTML = state.nearestPolygons
    .map(
      (_, index) => `
            <div class="dot ${
              index === state.currentScrollIndex ? "active" : ""
            }" 
                 onclick="scrollToIndex(${index})"></div>
        `
    )
    .join("");
}

// Render polygon details
function renderPolygonDetails() {
  elements.polygonTitle.textContent = `Ausgewählte Fläche #${state.selectedPolygonData.index}`;

  let detailsHTML = `
        <div class="detail-item">
            <span class="label">Entfernung:</span>
            <span class="value">${state.selectedPolygonData.distance.toFixed(
              2
            )} km</span>
        </div>
    `;

  if (state.selectedPolygonData.properties) {
    Object.entries(state.selectedPolygonData.properties).forEach(
      ([key, value]) => {
        if (value && value !== "" && value !== null) {
          detailsHTML += `
                    <div class="detail-item">
                        <span class="label">${key}:</span>
                        <span class="value">${value}</span>
                    </div>
                `;
        }
      }
    );
  }

  elements.detailsContent.innerHTML = detailsHTML;
}

// Debounce function to prevent API spam
function handleAddressInput(event) {
  state.addressInput = event.target.value;
  clearTimeout(debounceTimer);

  if (state.addressInput.length < 3) {
    state.suggestions = [];
    updateUI();
    return;
  }

  debounceTimer = setTimeout(async () => {
    state.isLoading.search = true;
    updateUI();

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          state.addressInput
        )}&format=json&limit=5`
      );
      state.suggestions = await response.json();
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      state.suggestions = [];
    }

    state.isLoading.search = false;
    updateUI();
  }, 500);
}

// Select address from suggestions
async function selectAddress(suggestion) {
  const lon = parseFloat(suggestion.lon);
  const lat = parseFloat(suggestion.lat);

  state.selectedPoint = { lat, lon };
  state.addressInput = suggestion.display_name;
  state.suggestions = [];
  updateUI();

  await findNearestPolygons(lat, lon);
}

// Handle map click
async function handleMapClick(e) {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;

  state.selectedPoint = { lat, lon };
  state.addressInput = `Angeklickte Position: ${lat.toFixed(4)}, ${lon.toFixed(
    4
  )}`;
  state.suggestions = [];
  updateUI();

  await findNearestPolygons(lat, lon);
}

// Find nearest polygons
async function findNearestPolygons(lat, lon) {
  state.isLoading.search = true;
  updateUI();

  console.log(
    `Searching for polygons near: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
  );

  const { index, properties, loadGeojson } = await dataPromise;
  const userPoint = turf.point([lon, lat]);

  // Debug the spatial index
  console.log(
    `Index bounds: [${index.minX}, ${index.minY}, ${index.maxX}, ${index.maxY}]`
  );
  console.log(`Search point: [${lon}, ${lat}]`);

  // Try the correct coordinate order (lon, lat)
  let candidateIds = index.neighbors(lon, lat, 20);
  console.log(
    `Spatial index found ${candidateIds.length} candidates:`,
    candidateIds.slice(0, 5)
  );

  // If spatial index returns no results, try a larger search radius
  if (candidateIds.length === 0) {
    console.log("No results, trying larger search radius...");
    candidateIds = index.neighbors(lon, lat, 100);
    console.log(`Larger radius found ${candidateIds.length} candidates`);
  }

  // If still no results, fall back to first 50 polygons
  if (candidateIds.length === 0) {
    console.log("Spatial index completely failed, using fallback...");
    candidateIds = Array.from({ length: 50 }, (_, i) => i);
  }

  console.log(`Processing ${candidateIds.length} candidate polygons`);

  // Load GeoJSON only when we need it for distance calculation
  const geojson = await loadGeojson();

  const candidates = candidateIds.map((id) => {
    const feature = geojson.features[id];
    // Calculate distance from point to polygon boundary
    const distance = turf.pointToPolygonDistance(userPoint, feature, {
      units: "kilometers",
    });
    return { id, properties: properties[id], distance, feature };
  });

  candidates.sort((a, b) => a.distance - b.distance);
  state.nearestPolygons = candidates.slice(0, 5);

  console.log(
    `Nearest 5 distances: ${state.nearestPolygons
      .map((p) => p.distance.toFixed(2))
      .join(", ")} km`
  );

  // Log the first few coordinates of each polygon to verify they're different
  state.nearestPolygons.forEach((p, i) => {
    try {
      const coords = p.feature.geometry.coordinates[0][0]; // First coordinate of first ring
      console.log(
        `Polygon ${i + 1}: [${coords[0]}, ${coords[1]}] - ${p.distance.toFixed(
          2
        )}km`
      );
    } catch (e) {
      console.log(
        `Polygon ${i + 1}: coordinate structure error - ${p.distance.toFixed(
          2
        )}km`
      );
      console.log("Geometry:", p.feature.geometry);
    }
  });

  state.isLoading.search = false;
  updateUI();

  // Show all 5 nearest polygons on the map
  showAllPolygonsOnMap(state.nearestPolygons);
}

// Show all polygons on map
function showAllPolygonsOnMap(polygons) {
  if (!mapInstance) return;

  // Clear previous layers
  geoLayers.clearLayers();

  // Add all polygons to the map with different colors
  const colors = ["tomato", "#ff6b6b", "#ffa500", "#ffb347", "#ffd700"];
  let allBounds = null;

  polygons.forEach((polygon, index) => {
    const polygonLayer = L.geoJSON(polygon.feature, {
      style: {
        color: colors[index],
        weight: 2,
        fillColor: colors[index],
        fillOpacity: 0.15,
        dashArray: index === 0 ? "5, 5" : "none", // Dashed for closest
      },
    }).addTo(geoLayers);

    // Extend bounds to include all polygons
    if (allBounds) {
      allBounds.extend(polygonLayer.getBounds());
    } else {
      allBounds = polygonLayer.getBounds();
    }
  });

  // Add marker for user's selected address
  if (state.selectedPoint) {
    L.marker([state.selectedPoint.lat, state.selectedPoint.lon], {
      icon: whiteDotIcon,
    }).addTo(geoLayers);
    allBounds.extend([state.selectedPoint.lat, state.selectedPoint.lon]);
  }

  // Zoom to show all polygons
  if (allBounds) {
    mapInstance.fitBounds(allBounds, {
      padding: [30, 30],
      maxZoom: 15,
    });
  }
}

// Show specific polygon on map
function showOnMap(index) {
  const polygon = state.nearestPolygons[index];
  console.log("showOnMap called with:", polygon);

  if (!mapInstance) {
    console.log("No map instance available");
    return;
  }

  // Set selected polygon data
  state.selectedPolygonData = {
    ...polygon,
    index: index + 1,
  };
  updateUI();

  // Clear previous layers
  geoLayers.clearLayers();

  // Add selected polygon to the map with better styling
  const polygonLayer = L.geoJSON(polygon.feature, {
    style: {
      color: "tomato",
      weight: 3,
      fillColor: "tomato",
      fillOpacity: 0.25,
      dashArray: "5, 5",
    },
  }).addTo(geoLayers);

  console.log("Polygon displayed on map");

  // Add marker for user's selected address
  const marker = L.marker([state.selectedPoint.lat, state.selectedPoint.lon], {
    icon: whiteDotIcon,
  }).addTo(geoLayers);

  // Zoom to just the polygon bounds (not including marker)
  mapInstance.fitBounds(polygonLayer.getBounds(), {
    padding: [20, 20],
    maxZoom: 15, // Close zoom focused on polygon
  });
}

// Scroll to specific index
function scrollToIndex(index) {
  const cardWidth = 156; // 140px min-width + 16px gap
  elements.resultsScroll.scrollTo({
    left: index * cardWidth,
    behavior: "smooth",
  });
  state.currentScrollIndex = index;
  updateUI();
}

// Close polygon details
function closePolygonDetails() {
  state.selectedPolygonData = null;
  updateUI();
}

// Initialize the map
function initializeMap() {
  // Wait for the DOM to be ready
  setTimeout(() => {
    try {
      const mapElement = document.getElementById("map");
      if (mapElement) {
        console.log("Initializing map...");

        // Northern Germany bounds (from our spatial index)
        const northernGermanyBounds = [
          [53.36, 8.29], // Southwest corner
          [55.05, 11.3], // Northeast corner
        ];

        mapInstance = L.map("map", {
          center: [54.2, 9.8],
          zoom: 8,
          maxBounds: northernGermanyBounds,
          maxBoundsViscosity: 1.0, // Prevents dragging outside bounds
          minZoom: 7,
          maxZoom: 17,
        });

        console.log("Map instance created");

        // Add satellite basemap
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              '&copy; <a href="https://www.esri.com/">Esri</a>, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
            maxZoom: 19,
          }
        ).addTo(mapInstance);

        console.log("Tile layer added");

        geoLayers = L.layerGroup().addTo(mapInstance);

        // Add click event to map
        mapInstance.on("click", handleMapClick);

        console.log("Map initialization complete");
      } else {
        console.error("Map element not found!");
      }
    } catch (error) {
      console.error("Map initialization failed:", error);
    }
  }, 100);
}

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  // Set up event listeners
  elements.addressInput.addEventListener("input", handleAddressInput);
  elements.closeButton.addEventListener("click", closePolygonDetails);
  elements.polygonOverlay.addEventListener("click", closePolygonDetails);

  // Initialize data and map
  initializeData();
  initializeMap();

  // Initial UI update
  updateUI();
});
