<script>
  import { onMount } from "svelte";
  import L from "leaflet";
  import Flatbush from "flatbush";
  import * as turf from "@turf/turf";

  // Import Leaflet CSS - this fixes the vite-plugin-sveltekit 3.0 compatibility issue
  import "leaflet/dist/leaflet.css";

  // Fix Leaflet marker icons for production
  import markerIcon from "leaflet/dist/images/marker-icon.png";
  import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
  import markerShadow from "leaflet/dist/images/marker-shadow.png";

  // Configure Leaflet default markers
  L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
  });

  // Svelte 5 State Management
  let addressInput = $state("");
  let suggestions = $state([]);
  let nearestPolygons = $state([]);
  let isLoading = $state({ data: true, search: false });
  let selectedPoint = $state(null); // { lat, lon }
  let selectedPolygonData = $state(null); // Selected polygon details
  let currentScrollIndex = $state(0); // For scroll snapping
  let scrollContainer; // Reference to scroll container
  let mapInstance;
  let geoLayers; // A leaflet layer group to manage features

  // A promise that resolves with our spatial data
  const dataPromise = (async () => {
    const timestamp = Date.now(); // Force cache refresh
    const [idxBuffer, properties] = await Promise.all([
      fetch(`./af_sh.idx?t=${timestamp}`).then((res) => res.arrayBuffer()),
      fetch(`./af_sh.json?t=${timestamp}`).then((res) => res.json()),
    ]);

    // Load GeoJSON lazily only when needed
    let geojson = null;
    const loadGeojson = async () => {
      if (!geojson) {
        console.log("Loading GeoJSON for distance calculations...");
        geojson = await fetch(`./af_sh.geojson?t=${timestamp}`).then((res) =>
          res.json()
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
      isLoading.data = false;
    })
    .catch((error) => {
      console.error("Failed to load spatial data:", error);
      isLoading.data = false;
    });

  // Debounce function to prevent API spam
  let debounceTimer;
  function handleAddressInput(event) {
    addressInput = event.target.value;
    clearTimeout(debounceTimer);
    if (addressInput.length < 3) {
      suggestions = [];
      return;
    }
    debounceTimer = setTimeout(async () => {
      isLoading.search = true;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=5`
      );
      suggestions = await response.json();
      isLoading.search = false;
    }, 500);
  }

  async function selectAddress(suggestion) {
    const lon = parseFloat(suggestion.lon);
    const lat = parseFloat(suggestion.lat);

    selectedPoint = { lat, lon };
    addressInput = suggestion.display_name;
    suggestions = []; // Clear suggestions

    await findNearestPolygons(lat, lon);
  }

  async function handleMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    selectedPoint = { lat, lon };
    addressInput = `Angeklickte Position: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    suggestions = []; // Clear suggestions

    await findNearestPolygons(lat, lon);
  }

  async function findNearestPolygons(lat, lon) {
    isLoading.search = true;

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
    nearestPolygons = candidates.slice(0, 5);

    console.log(
      `Nearest 5 distances: ${nearestPolygons.map((p) => p.distance.toFixed(2)).join(", ")} km`
    );

    // Log the first few coordinates of each polygon to verify they're different
    nearestPolygons.forEach((p, i) => {
      try {
        const coords = p.feature.geometry.coordinates[0][0]; // First coordinate of first ring
        console.log(
          `Polygon ${i + 1}: [${coords[0]}, ${coords[1]}] - ${p.distance.toFixed(2)}km`
        );
      } catch (e) {
        console.log(
          `Polygon ${i + 1}: coordinate structure error - ${p.distance.toFixed(2)}km`
        );
        console.log("Geometry:", p.feature.geometry);
      }
    });

    isLoading.search = false;

    // Show all 5 nearest polygons on the map
    showAllPolygonsOnMap(nearestPolygons);
  }

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
    if (selectedPoint) {
      L.marker([selectedPoint.lat, selectedPoint.lon]).addTo(geoLayers);
      allBounds.extend([selectedPoint.lat, selectedPoint.lon]);
    }

    // Zoom to show all polygons
    if (allBounds) {
      mapInstance.fitBounds(allBounds, {
        padding: [30, 30],
        maxZoom: 15,
      });
    }
  }

  function showOnMap(polygon, index) {
    console.log("showOnMap called with:", $state.snapshot(polygon));
    if (!mapInstance) {
      console.log("No map instance available");
      return;
    }

    // Set selected polygon data
    selectedPolygonData = {
      ...polygon,
      index: index + 1,
    };

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
    const marker = L.marker([selectedPoint.lat, selectedPoint.lon]).addTo(
      geoLayers
    );

    // Zoom to just the polygon bounds (not including marker)
    mapInstance.fitBounds(polygonLayer.getBounds(), {
      padding: [20, 20],
      maxZoom: 15, // Close zoom focused on polygon
    });
  }

  function scrollToIndex(index) {
    if (scrollContainer) {
      const cardWidth = 156; // 140px min-width + 16px gap
      scrollContainer.scrollTo({
        left: index * cardWidth,
        behavior: "smooth",
      });
      currentScrollIndex = index;
    }
  }

  // Initialize the map when the component mounts
  onMount(() => {
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
  });
</script>

<div class="app-container">
  <h1>Ausgleichsfläche near me</h1>

  {#if isLoading.data}
    <div class="loading-state">Lade räumlichen Index...</div>
  {:else}
    <div class="search-section">
      <input
        type="text"
        placeholder="Adresse eingeben oder auf die Karte klicken..."
        bind:value={addressInput}
        oninput={handleAddressInput}
      />

      <!-- Address Suggestions -->
      {#if suggestions.length > 0}
        <ul class="suggestions-list">
          {#each suggestions as s}
            <li onclick={() => selectAddress(s)}>{s.display_name}</li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Results Container Above Map -->
    {#if nearestPolygons.length > 0}
      <div class="results-container">
        <h3>Nächste Ausgleichsflächen:</h3>
        <div class="results-wrapper">
          <div class="results-scroll" bind:this={scrollContainer}>
            {#each nearestPolygons as p, index}
              <div class="result-card" onclick={() => showOnMap(p, index)}>
                <div class="result-info">
                  <span class="result-title">Fläche #{index + 1}</span>
                  <span class="result-distance">{p.distance.toFixed(2)} km</span
                  >
                </div>
                <div
                  class="color-indicator"
                  style="background-color: {[
                    'tomato',
                    '#ff6b6b',
                    '#ffa500',
                    '#ffb347',
                    '#ffd700',
                  ][index]}"
                ></div>
              </div>
            {/each}
          </div>
          <div class="scroll-gradient-left"></div>
          <div class="scroll-gradient-right"></div>
        </div>
        <div class="scroll-dots">
          {#each nearestPolygons as _, index}
            <div
              class="dot"
              class:active={index === currentScrollIndex}
              onclick={() => scrollToIndex(index)}
            ></div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Selected Polygon Data Overlay -->
    {#if selectedPolygonData}
      <div
        class="polygon-overlay"
        onclick={() => (selectedPolygonData = null)}
      ></div>
      <div class="polygon-details">
        <h4>
          <span>Ausgewählte Fläche #{selectedPolygonData.index}</span>
          <button
            class="close-button"
            onclick={() => (selectedPolygonData = null)}>×</button
          >
        </h4>
        <div class="details-content">
          <div class="detail-item">
            <span class="label">Entfernung:</span>
            <span class="value"
              >{selectedPolygonData.distance.toFixed(2)} km</span
            >
          </div>
          {#if selectedPolygonData.properties}
            {#each Object.entries(selectedPolygonData.properties) as [key, value]}
              {#if value && value !== "" && value !== null}
                <div class="detail-item">
                  <span class="label">{key}:</span>
                  <span class="value">{value}</span>
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    {#if isLoading.search}
      <div class="loading-state">Suche nach nächsten Ausgleichsflächen...</div>
    {/if}

    <div class="map-section">
      <div id="map"></div>
    </div>
  {/if}
</div>
