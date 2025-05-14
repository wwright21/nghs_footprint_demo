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

// global variables
let originalHexGeojson;
let currentTheme = "light"; // Default theme
let summaryStatsData = null;
let map, comparisonMap, compare;
let comparisonOriginalGeojson;
let comparisonMarker;
let previousComparisonLayer = null;
let currentBreaks = [];
let currentColors = [];

// -v-v-v-v-v-v-v-v MAPBOX MAP -v-v-v-v-v-v-v-v
map = new mapboxgl.Map({
  container: "before-map", // container ID
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
          '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.loopnet.com/commercial-real-estate-brokers/profile/george-hokayem/w7x34gkb", target="_blank">SVN Hokayem Co.</a>',
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

// Load stuff onto map when loaded
map.on("load", async () => {
  // Load the hex geometries
  const hexRes = await fetch("Data/hex_boundaries_comparison.geojson");
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
      "fill-opacity": 0.8,
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
      "line-opacity": 0.1,
    },
    filter: [">", ["get", "Visits"], 0],
  });

  // add common layers
  addCommonLayers(map, currentTheme);

  // Ensure these layers sit on top
  map.moveLayer("ga-county-outline");
  map.moveLayer("ga-county-labels");

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
});

// Initialize comparison map
function initializeComparisonMap(comparisonLayer) {
  return new Promise((resolve, reject) => {
    try {
      // get current map specs to pass to comparison map
      const mainMapState = {
        center: map.getCenter(),
        zoom: map.getZoom(),
      };

      comparisonMap = new mapboxgl.Map({
        container: "after-map",
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [themeStyles[currentTheme].tileUrl],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.loopnet.com/commercial-real-estate-brokers/profile/george-hokayem/w7x34gkb">SVN Hokayem Co.</a>',
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
        center: mainMapState.center,
        minZoom: 7, // farthest zoom out
        zoom: mainMapState.zoom, // starting zoom
        maxZoom: 15, // farthest zoom in
        crossOrigin: "anonymous",
        maxBounds: bounds,
      });

      // Wait for the comparison map to load
      comparisonMap.on("load", async () => {
        const hexResComp = await fetch(
          "Data/hex_boundaries_comparison.geojson"
        );
        const hexGeoJSON = await hexResComp.json();
        comparisonOriginalGeojson = hexGeoJSON;

        comparisonMap.addSource("comparison-hexes", {
          type: "geojson",
          data: comparisonOriginalGeojson,
        });

        if (!comparisonMap.getLayer("comparison-choropleth")) {
          comparisonMap.addLayer({
            id: "comparison-choropleth",
            type: "fill",
            source: "comparison-hexes",
            paint: {
              "fill-color": "#343a40",
              "fill-opacity": 0.5,
            },
            filter: [">", ["get", "value"], 0],
          });

          // Add hex outlines
          comparisonMap.addLayer({
            id: "comparison-hex-outline",
            type: "line",
            source: "comparison-hexes",
            paint: {
              "line-color": "#252525",
              "line-width": 0.5,
              "line-opacity": 0.1,
            },
            filter: [">", ["get", "value"], 0],
          });
        }

        // Set default metric
        const defaultMetric = comparisonLayer;

        // load the default data
        await loadComparisonLayer(defaultMetric);

        // Add tooltip handler with the default metric
        addTooltipHandler(
          comparisonMap,
          "comparison-choropleth",
          defaultMetric
        );

        // Set up tooltip positioning update for the comparison map
        comparisonMap.on("mousemove", (e) => {
          if (tooltip.style.display === "block") {
            tooltip.style.left = `${e.point.x + 10}px`;
            tooltip.style.top = `${e.point.y + 10}px`;
          }
        });

        // Add common layers
        addCommonLayers(comparisonMap, currentTheme);

        // Add scale control to comparison map
        const comparisonScale = new mapboxgl.ScaleControl({
          maxWidth: 175,
          unit: "imperial",
        });
        comparisonMap.addControl(comparisonScale, "bottom-right");

        // Add marker for Jefferson Location
        comparisonMarker = new mapboxgl.Marker({
          color: "#343a40",
          scale: 1,
        })
          .setLngLat([-83.5933854224835, 34.10526598277187])
          .setPopup(
            new mapboxgl.Popup({
              offset: 38,
              className: "custom-popup",
            }).setHTML("<h3>Jefferson Location</h3>")
          )
          .addTo(comparisonMap);

        comparisonMarker.getElement().style.cursor = "pointer";

        resolve(comparisonMap);
      });

      // Handle map load errors
      comparisonMap.on("error", function (e) {
        console.error("Comparison map error:", e);
        reject(e);
      });
    } catch (error) {
      console.error("Error initializing comparison map:", error);
      reject(error);
    }
  });
}

// function to add layers that will be displayed on both main and comparison map
function addCommonLayers(mapInstance, theme) {
  const styles = themeStyles[theme];

  // County outlines
  if (!mapInstance.getSource("ga-counties")) {
    mapInstance.addSource("ga-counties", {
      type: "geojson",
      data: "Data/GA_counties.geojson",
    });
  }

  if (!mapInstance.getLayer("ga-county-outline")) {
    mapInstance.addLayer({
      id: "ga-county-outline",
      type: "line",
      source: "ga-counties",
      paint: {
        "line-color": styles.countyOutline,
        "line-width": 1,
      },
    });
  }

  // County labels
  if (!mapInstance.getSource("ga-county-labels")) {
    mapInstance.addSource("ga-county-labels", {
      type: "geojson",
      data: "Data/GA_counties_centroids.geojson",
    });
  }

  if (!mapInstance.getLayer("ga-county-labels")) {
    mapInstance.addLayer({
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
  }
}

// tooltip labels, legend headers
const metricLabels = {
  Visits: "Visits",
  current_population: "Current Population",
  median_income: "Median Income",
  percent_below_poverty: "% Below Poverty Line",
};

// for legend items in the comparison map
const currencyPrefixes = {
  median_income: "$",
  median_home_price: "$",
};

// create tooltip for both maps
function addTooltipHandler(mapInstance, layerId, metricKey) {
  mapInstance.on("mousemove", layerId, (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];

      // The key issue: you need to access the 'value' property, not the metricKey
      // In your geojson structure, the actual value is stored in properties.value
      const value = feature.properties.value;

      // Format value based on metric type
      let displayValue = "N/A";

      if (value !== null && value !== undefined && value !== 0) {
        // Apply currency format if needed
        if (currencyPrefixes[metricKey]) {
          displayValue = `${
            currencyPrefixes[metricKey]
          }${value.toLocaleString()}`;
        }
        // Apply percentage format if needed
        else if (metricKey.includes("percent")) {
          displayValue = `${value.toLocaleString()}%`;
        }
        // Default number format
        else {
          displayValue = value.toLocaleString();
        }
      }

      const label = metricLabels[metricKey] || metricKey;

      tooltip.innerHTML = `<strong>${label}:</strong> ${displayValue}`;
      tooltip.style.display = "block";
      tooltip.style.left = `${e.originalEvent.pageX + 10}px`;
      tooltip.style.top = `${e.originalEvent.pageY + 10}px`;
    }
  });

  mapInstance.on("mouseleave", layerId, () => {
    tooltip.style.display = "none";
  });
}

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

// Department choropleth selection v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-
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

  // Update the legend
  updateLegend(breaks, colors);
}

// Function to update the legend
function updateLegend(breaks, colors) {
  const legendItems = document.getElementById("legend-items");

  // Clear existing legend items
  legendItems.innerHTML = "";

  // Add this function to format numbers with thousands separator
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Add legend items
  for (let i = 0; i < breaks.length - 1; i++) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const key = document.createElement("span");
    key.className = "legend-key";
    key.style.backgroundColor = colors[i];

    const value = document.createElement("span");

    // Format the range text WITH thousands separator
    if (i === breaks.length - 2) {
      // Last item
      value.textContent = `${formatNumber(Math.round(breaks[i]))}+`;
    } else {
      value.textContent = `${formatNumber(
        Math.round(breaks[i])
      )} - ${formatNumber(Math.round(breaks[i + 1]))}`;
    }

    item.appendChild(key);
    item.appendChild(value);
    legendItems.appendChild(item);
  }

  // Show the legend
  document.getElementById("legend").style.display = "block";
}

// Comparison map choropleth section v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
async function loadComparisonLayer(selectedLayer) {
  // if the comparison layer isn't 'aerial', load it
  if (selectedLayer !== "aerial") {
    try {
      const csvPath = `Data/comparison_layers/${selectedLayer}.csv`;
      const csvData = await d3.csv(csvPath);

      // Lookup values by hex_id
      const valueLookup = {};
      csvData.forEach((d) => {
        valueLookup[d.hex_id] = +d.value;
      });

      // Clone and augment GeoJSON
      const updatedGeojson = JSON.parse(
        JSON.stringify(comparisonOriginalGeojson)
      );
      updatedGeojson.features.forEach((f) => {
        const hexId = f.properties.hex_id;
        f.properties.value = valueLookup[hexId] || 0;

        // Optionally store the selected metric name as a property
        // This can be useful for debugging or advanced functionality
        f.properties.metricName = selectedLayer;
      });

      // Add source if not yet added
      if (!comparisonMap.getSource("comparison-hexes")) {
        comparisonMap.addSource("comparison-hexes", {
          type: "geojson",
          data: updatedGeojson,
        });
      } else {
        comparisonMap.getSource("comparison-hexes").setData(updatedGeojson);
      }

      // Add layer if not yet added
      if (!comparisonMap.getLayer("comparison-choropleth")) {
        comparisonMap.addLayer({
          id: "comparison-choropleth",
          type: "fill",
          source: "comparison-hexes",
          paint: {
            "fill-color": "#ccc",
            "fill-opacity": 0.8,
          },
          filter: [">", ["get", "value"], 0],
        });
      }

      // Compute Jenks breaks
      const values = updatedGeojson.features
        .map((f) => f.properties.value)
        .filter((v) => v > 0);

      if (values.length > 1) {
        const breaks = ss.jenks(values, 6);
        const colors = [
          "#eff3ff",
          "#c6dbef",
          "#9ecae1",
          "#6baed6",
          "#3182bd",
          "#08519c",
        ];

        const colorExpression = ["interpolate", ["linear"], ["get", "value"]];
        for (let i = 1; i < breaks.length; i++) {
          colorExpression.push(breaks[i - 1], colors[i - 1]);
        }

        comparisonMap.setPaintProperty(
          "comparison-choropleth",
          "fill-color",
          colorExpression
        );

        updateComparisonLegend(breaks, colors, selectedLayer);
      }

      return true; // Indicate successful completion
    } catch (error) {
      console.error("Comparison map error:", error);
      throw error; // Propagate the error
    }
  }
}

// choropleth breaks
function updateComparisonBreaks(geojson) {
  const values = geojson.features
    .map((f) => f.properties.value)
    .filter((v) => v > 0);

  if (values.length < 2) return;

  const breaks = ss.jenks(values, 5);
  const colors = ["#edf8fb", "#b3cde3", "#8c96c6", "#8856a7", "#810f7c"];

  const colorExpression = ["interpolate", ["linear"], ["get", "value"]];
  for (let i = 1; i < breaks.length; i++) {
    colorExpression.push(breaks[i - 1], colors[i - 1]);
  }

  comparisonMap.setPaintProperty(
    "comparison-choropleth",
    "fill-color",
    colorExpression
  );
}

// Function to update the comparison map when a new metric is selected
function updateComparisonMetric(selectedMetric) {
  // Load the data for the selected metric
  loadComparisonLayer(selectedMetric)
    .then(() => {
      // Remove existing tooltip handlers to avoid duplicates
      comparisonMap.off("mousemove", "comparison-choropleth");
      comparisonMap.off("mouseleave", "comparison-choropleth");

      // Add new tooltip handler with the updated metric key
      addTooltipHandler(comparisonMap, "comparison-choropleth", selectedMetric);
    })
    .catch((err) => {
      console.error("Error updating comparison metric:", err);
    });
}

// choropleth legend
function updateComparisonLegend(breaks, colors, selectedMetric) {
  // Update the legend title using the label map
  const legendTitleEl = document.getElementById("comparison-legend-title");
  legendTitleEl.textContent = metricLabels[selectedMetric] || selectedMetric;

  // Determine if the metric has a currency prefix
  const currencyPrefix = currencyPrefixes[selectedMetric] || "";

  const legendItems = document.getElementById("comparison-legend-items");
  legendItems.innerHTML = ""; // Clear existing legend items

  const formatNumber = (num) =>
    num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); // Add commas to numbers

  for (let i = 0; i < breaks.length - 1; i++) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const key = document.createElement("span");
    key.className = "legend-key";
    key.style.backgroundColor = colors[i];

    const value = document.createElement("span");

    if (i === breaks.length - 2) {
      // Last item in legend (highest value range)
      value.textContent = `${currencyPrefix}${formatNumber(
        Math.round(breaks[i])
      )}+`;
    } else {
      // Regular range item
      value.textContent = `${currencyPrefix}${formatNumber(
        Math.round(breaks[i])
      )} - ${currencyPrefix}${formatNumber(Math.round(breaks[i + 1]))}`;
    }

    item.appendChild(key);
    item.appendChild(value);
    legendItems.appendChild(item);
  }

  // Show the comparison legend
  document.getElementById("comparison-legend").style.display = "block";
}

// Light / Dark theming v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-
const themeStyles = {
  light: {
    tileUrl:
      "https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png",
    countyOutline: "#000000",
    drivetime: "#4292c6",
    hexOutline: "#000000",
  },
  dark: {
    tileUrl:
      "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png",
    countyOutline: "#ffffff",
    drivetime: "#4292c6",
    hexOutline: "#f0f0f0",
  },
};

// Function to update all layer colors based on light / dark theme
function updateLayerColors(theme) {
  const styles = themeStyles[theme];

  // Primary map
  if (map.getLayer("ga-county-outline")) {
    map.setPaintProperty(
      "ga-county-outline",
      "line-color",
      styles.countyOutline
    );
  }
  if (map.getLayer("hex-outline")) {
    map.setPaintProperty("hex-outline", "line-color", styles.hexOutline);
  }

  // Comparison map
  if (comparisonMap) {
    if (comparisonMap.getLayer("ga-county-outline")) {
      comparisonMap.setPaintProperty(
        "ga-county-outline",
        "line-color",
        styles.countyOutline
      );
    }
    if (comparisonMap.getLayer("hex-outline")) {
      comparisonMap.setPaintProperty(
        "hex-outline",
        "line-color",
        styles.hexOutline
      );
    }
  }

  // Update legend appearance for dark/light mode
  const legend = document.getElementById("legend");
  if (legend) {
    if (theme === "dark") {
      legend.classList.add("dark-mode");
    } else {
      legend.classList.remove("dark-mode");
    }
  }

  const drivetimeLayers = ["drivetime-10", "drivetime-20", "drivetime-30"];
  drivetimeLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "line-color", styles.drivetime);
    }
  });
}

// Handles toggling on / off drivetime layer with correct color
function toggleDrivetimeLayer(layerId, sourceId, geoData, isChecked) {
  const styles = themeStyles[currentTheme];

  if (isChecked) {
    // --- Add source to both maps if it doesn't exist
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: geoData,
      });
    }

    if (comparisonMap && !comparisonMap.getSource(sourceId)) {
      comparisonMap.addSource(sourceId, {
        type: "geojson",
        data: geoData,
      });
    }

    // --- Add layer to main map if it doesn't exist
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": styles.drivetime,
          "line-width": 2,
        },
      });
    } else {
      map.setLayoutProperty(layerId, "visibility", "visible");
      map.setPaintProperty(layerId, "line-color", styles.drivetime);
    }

    // --- Add layer to comparison map if it exists
    if (comparisonMap) {
      if (!comparisonMap.getLayer(layerId)) {
        comparisonMap.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": styles.drivetime,
            "line-width": 2,
          },
        });
      } else {
        comparisonMap.setLayoutProperty(layerId, "visibility", "visible");
        comparisonMap.setPaintProperty(layerId, "line-color", styles.drivetime);
      }
    }
  } else {
    // --- Hide layers on both maps if they exist
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }

    if (comparisonMap && comparisonMap.getLayer(layerId)) {
      comparisonMap.setLayoutProperty(layerId, "visibility", "none");
    }
  }
}

// Functions to load update drivetime stats table
async function loadSummaryStatsData() {
  try {
    if (summaryStatsData === null) {
      const response = await fetch("Data/drivetime-stats.csv");
      const csvText = await response.text();
      summaryStatsData = Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
      }).data;
    }
    return summaryStatsData;
  } catch (error) {
    console.error("Error loading summary stats:", error);
    return [];
  }
}

// Function to update the summary stats table
async function updateSummaryStatsTable(departmentValue) {
  // Get the table container and update the title
  const container = document.getElementById("summary-stats-container");
  const title = container.querySelector("h3") || document.createElement("h3");
  title.textContent = "Visits by Drivetime";
  if (!title.parentElement) {
    container.prepend(title);
  }

  // Get the table body element
  const tableBody = document.getElementById("summary-stats-body");

  // Clear the current table content
  tableBody.innerHTML = "";

  try {
    // Load the summary stats data
    const statsData = await loadSummaryStatsData();

    if (!statsData || statsData.length === 0) {
      throw new Error("No data available in the CSV");
    }

    // Find the row for the selected department
    let departmentRow = null;

    // Try different matching strategies
    for (const row of statsData) {
      // Try exact match
      if (row["Department Name"] === departmentValue) {
        departmentRow = row;
        break;
      }

      // Try with underscores replaced by spaces
      const departmentWithSpaces = departmentValue.replace(/_/g, " ");
      if (row["Department Name"] === departmentWithSpaces) {
        departmentRow = row;
        break;
      }

      // Try with spaces replaced by underscores
      const departmentWithUnderscores = departmentValue.replace(/ /g, "_");
      if (row["Department Name"] === departmentWithUnderscores) {
        departmentRow = row;
        break;
      }
    }

    if (departmentRow) {
      // Create rows for the table in long format

      // 1. Total Visits row
      const totalRow = document.createElement("tr");

      const totalLabelCell = document.createElement("td");
      totalLabelCell.textContent = "Total:";
      totalLabelCell.style.fontWeight = "bold";
      totalRow.appendChild(totalLabelCell);

      const totalValueCell = document.createElement("td");
      // Format with thousands separator
      const totalVisits = departmentRow["total_visits"];
      totalValueCell.textContent =
        totalVisits != null
          ? new Intl.NumberFormat().format(totalVisits)
          : "N/A";
      totalRow.appendChild(totalValueCell);

      tableBody.appendChild(totalRow);

      // 2. Drivetime percentage rows
      const drivetimeData = [
        { label: "10 min:", column: "in_10_%" },
        { label: "20 min:", column: "in_20_%" },
        { label: "30 min:", column: "in_30_%" },
      ];

      drivetimeData.forEach((item) => {
        const row = document.createElement("tr");

        const labelCell = document.createElement("td");
        labelCell.textContent = item.label;
        row.appendChild(labelCell);

        const valueCell = document.createElement("td");
        // Format as percentage with 1 decimal place
        const value = departmentRow[item.column];
        valueCell.textContent =
          value != null ? `${parseFloat(value).toFixed(1)}%` : "N/A";
        row.appendChild(valueCell);

        tableBody.appendChild(row);
      });
    } else {
      // If no matching department is found
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2; // Changed from 4 to 2 for the new format
      td.textContent = `No data available for department: ${departmentValue}`;
      tr.appendChild(td);
      tableBody.appendChild(tr);
    }
  } catch (error) {
    console.error("Error updating summary stats table:", error);

    // Show error message in the table
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2; // Changed from 4 to 2 for the new format
    td.textContent = `Error loading statistics: ${error.message}`;
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }

  // Apply current theme to the table container
  if (typeof currentTheme !== "undefined") {
    if (currentTheme === "dark") {
      container.classList.add("dark-mode");
    } else {
      container.classList.remove("dark-mode");
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
  const checkbox20 = document.getElementById("drivetime-20");
  const checkbox30 = document.getElementById("drivetime-30");
  const initialDepartment = "All";

  // Hide the after-map initially
  document.getElementById("after-map").style.display = "none";

  // Load initial summary stats
  updateSummaryStatsTable(initialDepartment).catch((error) =>
    console.error(error)
  );

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

    // Update the tile source for main map
    map.getSource("carto").setTiles([themeStyles[selectedValue].tileUrl]);

    // Update tile source for after-map, if it exists
    if (comparisonMap && comparisonMap.getSource("carto")) {
      comparisonMap
        .getSource("carto")
        .setTiles([themeStyles[selectedValue].tileUrl]);
    }

    // Update polygon outline colors based on the basemap
    updateLayerColors(selectedValue);

    // Update UI elements based on theme
    const elementsToUpdate = [
      { selector: "#legend", class: "dark-mode" },
      { selector: "#comparison-legend", class: "dark-mode" },
      { selector: "header", class: "dark-mode" },
      { selector: "#summary-stats-container", class: "dark-mode" },
      { selector: ".openDrawerBtn", class: "dark-mode" },
    ];

    elementsToUpdate.forEach((item) => {
      const element = document.querySelector(item.selector);
      if (element) {
        if (selectedValue === "dark") {
          element.classList.add(item.class);
        } else {
          element.classList.remove(item.class);
        }
      }
    });
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

  if (checkbox20) {
    checkbox20.addEventListener("sl-change", (event) => {
      toggleDrivetimeLayer(
        "drivetime-20",
        "drivetimeSource-20",
        "Data/drivetime_20.geojson",
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

      // Update the map
      loadDepartmentData(department);

      // Update the statistics table
      updateSummaryStatsTable(department);
    });

  // when the compareMapToggle is switched on, change display to block for comparisonDropdownContainer
  compareMapToggle.addEventListener("sl-change", (event) => {
    const isChecked = event.target.checked;

    if (isChecked) {
      // Enable the select element
      comparisonLayerSelect.removeAttribute("disabled");

      // Show the comparison map container
      document.getElementById("after-map").style.display = "block";

      // Conditionally show the comparison legend
      const comparisonLegend = document.getElementById("comparison-legend");
      if (comparisonLayerSelect.value !== "aerial") {
        comparisonLegend.style.display = "block";
      } else {
        comparisonLegend.style.display = "none";
      }

      const selectedComparisonLayer = comparisonLayerSelect.value;

      // Initialize the comparison map if it doesn't exist yet
      if (!comparisonMap) {
        initializeComparisonMap(selectedComparisonLayer)
          .then(() => {
            // Create the compare instance after the comparison map is initialized
            compare = new mapboxgl.Compare(
              map,
              comparisonMap,
              "#comparison-container",
              {
                mousemove: false,
              }
            );
          })
          .catch((error) => {
            console.error("Error initializing comparison map:", error);
          });
      } else {
        // If the map already exists, just create the compare instance
        compare = new mapboxgl.Compare(
          map,
          comparisonMap,
          "#comparison-container",
          {
            mousemove: false,
          }
        );
      }
    } else {
      // Disable the select element
      comparisonLayerSelect.setAttribute("disabled", "");

      // Remove the compare functionality
      if (compare) {
        compare.remove();
        compare = null;
      }

      // Hide the comparison map container
      document.getElementById("after-map").style.display = "none";
      const comparisonLegend = document.getElementById("comparison-legend");
      comparisonLegend.style.display = "none";
    }
  });

  // update comparison map layer based on dropdown menu selection
  comparisonLayerSelect.addEventListener("sl-change", (event) => {
    const selectedLayer = event.target.value;

    // Handle the 'aerial' layer
    if (selectedLayer === "aerial") {
      // Remove Carto basemap style and set Google Aerial tiles
      comparisonMap.setStyle({
        version: 8,
        sources: {
          aerial: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Imagery © Esri",
          },
        },
        layers: [
          {
            id: "esri-tiles",
            type: "raster",
            source: "aerial",
          },
        ],
      });

      // remove comparison legend
      document.getElementById("comparison-legend").style.display = "none";

      // remove old marker
      comparisonMarker.remove();

      // add red marker for aerial view
      comparisonMarker = new mapboxgl.Marker({
        color: "#ff4d4d", // New color
        scale: 1,
      })
        .setLngLat([-83.5933854224835, 34.10526598277187])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>Jefferson Location</h3>")
        )
        .addTo(comparisonMap);

      // Set cursor style
      comparisonMarker.getElement().style.cursor = "pointer";

      return;
    }

    // Switching away from aerial — reset the style but keep the comparisonMap instance
    comparisonMap.setStyle({
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: [themeStyles[currentTheme].tileUrl],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://carto.com/">CARTO</a> | <a href="https://www.loopnet.com/commercial-real-estate-brokers/profile/george-hokayem/w7x34gkb">SVN Hokayem Co.</a>',
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
    });

    // Wait for style to fully reload
    comparisonMap.once("styledata", async () => {
      // Re-add Jefferson marker
      if (comparisonMarker) comparisonMarker.remove();

      comparisonMarker = new mapboxgl.Marker({
        color: "#343a40",
        scale: 1,
      })
        .setLngLat([-83.5933854224835, 34.10526598277187])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>Jefferson Location</h3>")
        )
        .addTo(comparisonMap);

      comparisonMarker.getElement().style.cursor = "pointer";

      // Re-add any common layers like boundaries, outlines, etc.
      addCommonLayers(comparisonMap, currentTheme);

      // Re-add the data layer
      await loadComparisonLayer(selectedLayer);

      // show in the console the layers in the comparisonMap
      comparisonMap.moveLayer("ga-county-outline");
      comparisonMap.moveLayer("ga-county-labels");

      // Rebind tooltip
      addTooltipHandler(comparisonMap, "comparison-choropleth", selectedLayer);

      // Update legend
      updateComparisonLegend(breaks, colors, selectedLayer);
    });
  });
});
