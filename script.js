// token
mapboxgl.accessToken =
  "pk.eyJ1Ijoid3dyaWdodDIxIiwiYSI6ImNtYTJ4NWtwdjAwb2oydnEzdjV0anRxeWIifQ.h63WS8JxUedXWYkcNCkSnQ";

// Helper function to reverse latitude and longitude in bounds
const LatLngUtils = {
  reverse(coord) {
    return [coord[1], coord[0]];
  },
  reverseBounds(sw, ne) {
    return [
      [sw[1], sw[0]],
      [ne[1], ne[0]],
    ];
  },
};

// Paste Google lat / long values here
const center = LatLngUtils.reverse([34.109140555495806, -83.59414405548036]);
const bounds = LatLngUtils.reverseBounds(
  [29.69986828935751, -89.76426300237956], // SW
  [37.00321344128091, -76.06740030653897] // NE
);

// -v-v-v-v-v-v-v-v MAPBOX MAP -v-v-v-v-v-v-v-v
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png",
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    },
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    layers: [
      {
        id: "carto-layer",
        type: "raster",
        source: "carto",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  },
  center: center,
  minZoom: 7, // farthest zoom out
  zoom: 9,
  maxZoom: 15, // farthest zoom in
  crossOrigin: "anonymous",
  maxBounds: bounds,
});

// global variables
let originalHexGeojson;
let currentTheme = "light"; // Default theme

// Load stuff onto map when loaded
map.on("load", async () => {
  // Load the hex geometries
  const hexRes = await fetch("Data/hex_boundaries_reprojected.geojson");
  const hexGeoJSON = await hexRes.json();

  originalHexGeojson = hexGeoJSON; // store globally for re-use

  // Load and parse the CSV
  const csvText = await fetch("Data/All.csv").then((res) => res.text());
  const csvData = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
  }).data;

  // Create a lookup table: hex_id -> Visits
  const visitLookup = {};
  csvData.forEach((row) => {
    visitLookup[row.hex_id] = row.Visits;
  });

  // Join Visits into GeoJSON
  hexGeoJSON.features.forEach((feature) => {
    const hexId = feature.properties.hex_id;
    feature.properties.Visits = visitLookup[hexId] || 0;
  });

  // Create tooltip element
  const tooltip = document.getElementById("tooltip");

  let mouseX = 0;
  let mouseY = 0;
  let tooltipX = 0;
  let tooltipY = 0;

  // Track mouse position globally
  document.addEventListener("mousemove", (e) => {
    mouseX = e.pageX;
    mouseY = e.pageY;
  });

  // Animate tooltip to "chase" cursor
  function animateTooltip() {
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 10;

    // Set default offsets (bottom-right of cursor)
    let offsetX = 10;
    let offsetY = 10;

    // Flip to left if near right edge
    if (mouseX + tooltipRect.width + padding > window.innerWidth) {
      offsetX = -tooltipRect.width - 10;
    }

    // Flip up if near bottom edge
    if (mouseY + tooltipRect.height + padding > window.innerHeight) {
      offsetY = -tooltipRect.height - 10;
    }

    // Smoothly interpolate to new position
    tooltipX += (mouseX + offsetX - tooltipX) * 0.1;
    tooltipY += (mouseY + offsetY - tooltipY) * 0.1;

    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;

    requestAnimationFrame(animateTooltip);
  }
  animateTooltip();

  // Track hover over hex layer
  map.on("mousemove", "visits-choropleth", (e) => {
    const feature = e.features[0];
    const visits = feature.properties.Visits;

    tooltip.innerHTML = `<strong>Visits:</strong> ${visits.toLocaleString()}`;
    tooltip.style.display = "block";
  });

  // Hide tooltip when not hovering
  map.on("mouseleave", "visits-choropleth", () => {
    tooltip.style.display = "none";
  });

  // Add the map layers -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
  map.addSource("hexes", {
    type: "geojson",
    data: originalHexGeojson,
  });

  // Add hex choropleth
  map.addLayer({
    id: "visits-choropleth",
    type: "fill",
    source: "hexes",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "Visits"],
        1,
        "#fef0d9",
        5,
        "#fdcc8a",
        10,
        "#fc8d59",
        20,
        "#e34a33",
        50,
        "#b30000",
      ],
      "fill-opacity": 0.7,
    },
    filter: [">", ["get", "Visits"], 0],
  });

  // Load the default CSV into the global source
  await loadDepartmentData("All");

  // Add hex outlines
  map.addLayer({
    id: "hex-outline",
    type: "line",
    source: "hexes",
    paint: {
      "line-color": "#252525",
      "line-width": 0.5,
    },
    filter: [">", ["get", "Visits"], 0],
  });

  // Add county source
  map.addSource("ga-counties", {
    type: "geojson",
    data: "Data/GA_counties.geojson", // adjust path if needed
  });

  // county outlines
  map.addLayer({
    id: "ga-county-outline",
    type: "line",
    source: "ga-counties",
    paint: {
      "line-color": "#000000",
      "line-width": 1,
    },
  });

  // Ensure county is above hex choropleth layer
  map.moveLayer("ga-county-outline-halo");
  map.moveLayer("ga-county-outline");

  // county text labels
  map.addSource("ga-county-labels", {
    type: "geojson",
    data: "Data/GA_counties_centroids.geojson",
  });
  map.addLayer({
    id: "ga-county-labels",
    type: "symbol",
    source: "ga-county-labels",
    layout: {
      "text-field": ["to-string", ["upcase", ["get", "NAME"]]],
      "text-font": ["Open Sans Bold Italic", "Arial Unicode MS Regular"],
      "text-size": 15,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#000000",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
    minzoom: 9,
  });

  // Add marker for Jefferson Location
  new mapboxgl.Marker({ color: "#343a40", scale: 1 })
    .setLngLat([-83.5933854224835, 34.10526598277187])
    .setPopup(
      new mapboxgl.Popup({ offset: 38, className: "custom-popup" }).setHTML(
        "<h3>Jefferson Location</h3>"
      )
    )
    .addTo(map)
    .getElement().style.cursor = "pointer";

  // set up event listeners for drivetime checkboxes
  setupCheckboxListeners();
});

// Map scale -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
const scale = new mapboxgl.ScaleControl({
  maxWidth: 175,
  unit: "imperial",
});
map.addControl(scale, "bottom-right");

// Geocoder -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
const geocoderSW = [33.562515748519296, -84.42598713848297];
const geocoderNE = [34.986892324333375, -82.25873947850033];

const geocoderBounds = [
  ...LatLngUtils.reverse(geocoderSW),
  ...LatLngUtils.reverse(geocoderNE),
];

const geocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  mapboxgl: mapboxgl,
  placeholder: "Search for an address:",
  bbox: geocoderBounds,
  limit: 5,
});

// get the geocoder container element
const geocoderContainer = geocoder.onAdd(map);

// append the geocoder container to a separate <div> element
document.getElementById("geocoder-container").appendChild(geocoderContainer);

// Department choropleth selection -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-
async function loadDepartmentData(departmentValue) {
  const csvPath = `Data/${departmentValue}.csv`;
  const csvData = await d3.csv(csvPath);

  const visitsLookup = {};
  csvData.forEach((d) => {
    visitsLookup[d.hex_id] = +d.Visits;
  });

  // Clone and augment GeoJSON
  const updatedGeojson = JSON.parse(JSON.stringify(originalHexGeojson));
  updatedGeojson.features.forEach((f) => {
    const hexId = f.properties.hex_id;
    f.properties.Visits = visitsLookup[hexId] || 0;
  });

  map.getSource("hexes").setData(updatedGeojson);
  updateChoroplethBreaks(updatedGeojson);
}

// Dynamically update the choropleth breaks based on the data
function updateChoroplethBreaks(geojson) {
  const values = geojson.features
    .map((f) => f.properties.Visits)
    .filter((v) => v > 0);

  if (values.length < 2) return;

  const breaks = ss.jenks(values, 5); // set number of breaks using Jenks

  const colors = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"];
  const colorExpression = ["interpolate", ["linear"], ["get", "Visits"]];
  for (let i = 1; i < breaks.length; i++) {
    colorExpression.push(breaks[i - 1], colors[i - 1]);
  }

  map.setPaintProperty("visits-choropleth", "fill-color", colorExpression);
}

// Define theme styles - can be outside since it's just data
const themeStyles = {
  light: {
    tileUrl:
      "https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png",
    countyOutline: "#000000",
    drivetime: "#737373",
  },
  dark: {
    tileUrl:
      "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png",
    countyOutline: "#ffffff",
    drivetime: "#d9d9d9",
  },
};

// Function to update all layer colors based on light / dark theme
function updateLayerColors(theme) {
  const styles = themeStyles[theme];

  if (map.getLayer("ga-county-outline")) {
    map.setPaintProperty(
      "ga-county-outline",
      "line-color",
      styles.countyOutline
    );
  }

  const drivetimeLayers = ["drivetime-10", "drivetime-15", "drivetime-30"];
  drivetimeLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "line-color", styles.drivetime);
    }
  });
}

// Handles toggling on / off drivetime layer with correct color
function toggleDrivetimeLayer(layerId, sourceId, geoData, isChecked) {
  if (isChecked) {
    // If the layer doesn't exist yet, add it
    if (!map.getLayer(layerId)) {
      // Add source if it doesn't exist
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: geoData,
        });
      }

      // Get the color based on current theme
      const styles = themeStyles[currentTheme];

      // Add the layer with the correct color
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": styles.drivetime,
          "line-width": 1,
        },
      });
    } else {
      // If the layer exists, just make it visible
      map.setLayoutProperty(layerId, "visibility", "visible");

      // Update the color based on current theme
      const styles = themeStyles[currentTheme];
      map.setPaintProperty(layerId, "line-color", styles.drivetime);
    }
  } else {
    // Hide the layer if it exists
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  }
}

// Wait for the DOM & then do a buncha stuff -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
document.addEventListener("DOMContentLoaded", () => {
  const drawer = document.querySelector("sl-drawer");
  const openBtn = document.querySelector(".openDrawerBtn");
  const closeBtn = drawer.querySelector(".close-button");
  const radioGroup = document.querySelector("sl-radio-group");
  const tooltip = document.getElementById("drawerTooltip");
  const compareMapToggle = document.getElementById("compareDemographics");
  const comparisonLayerSelect = document.getElementById("comparisonSelect");
  const checkbox10 = document.getElementById("drivetime-10");
  const checkbox15 = document.getElementById("drivetime-15");
  const checkbox30 = document.getElementById("drivetime-30");

  // Open the drawer
  openBtn.addEventListener("click", () => {
    drawer.show();
  });

  // Close the drawer
  closeBtn.addEventListener("click", () => {
    drawer.hide();
  });

  // Toggle the basemap from light to dark
  radioGroup.addEventListener("sl-change", (event) => {
    const selectedValue = event.target.value;

    // Update the current theme tracker
    currentTheme = selectedValue;

    // Update the tile source with new URL
    map.getSource("carto").setTiles([themeStyles[selectedValue].tileUrl]);

    // Update polygon outline colors based on the basemap
    updateLayerColors(selectedValue);
  });

  // Add event listeners for drivetime checkboxes
  if (checkbox10) {
    checkbox10.addEventListener("sl-change", (event) => {
      toggleDrivetimeLayer(
        "drivetime-10",
        "drivetimeSource-10",
        "Data/drivetime_10.geojson",
        event.target.checked
      );
    });
  }

  if (checkbox15) {
    checkbox15.addEventListener("sl-change", (event) => {
      toggleDrivetimeLayer(
        "drivetime-15",
        "drivetimeSource-15",
        "Data/drivetime_15.geojson",
        event.target.checked
      );
    });
  }

  if (checkbox30) {
    checkbox30.addEventListener("sl-change", (event) => {
      toggleDrivetimeLayer(
        "drivetime-30",
        "drivetimeSource-30",
        "Data/drivetime_30.geojson",
        event.target.checked
      );
    });
  }

  // Show drawer tooltip only when hovering
  openBtn.addEventListener("mouseenter", () => {
    tooltip.show();
  });

  // Hide drawer tooltip when not hovering
  openBtn.addEventListener("mouseleave", () => {
    tooltip.hide();
  });

  // Hide drawer tooltip if the drawer is closed (in case it re-triggers)
  drawer.addEventListener("sl-after-hide", () => {
    tooltip.hide();
  });

  // Listen for department selection changes
  document
    .querySelector("#departmentSelect")
    .addEventListener("sl-change", (event) => {
      const department = event.target.value;
      loadDepartmentData(department);
    });

  // when the compareMapToggle is switched on, change display to block for comparisonDropdownContainer
  compareMapToggle.addEventListener("sl-change", (event) => {
    // Check if the switch is checked (toggled on)
    if (event.target.checked) {
      // Enable the select element by removing the disabled attribute
      comparisonLayerSelect.removeAttribute("disabled");
    } else {
      // Disable the select element again
      comparisonLayerSelect.setAttribute("disabled", "");
    }
  });
});
