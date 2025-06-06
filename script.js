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
let hoveredHexId = null;
let hoveredComparisonHexId = null;
let animationFrameId = null;
let targetHexFeature = null;
let currentHexFeature = null;
let targetComparisonHexFeature = null;
let currentComparisonHexFeature = null;

// Custom marker element creation function
function createCustomMarker(scale = 1.0) {
  const el = document.createElement('div');
  el.className = 'custom-marker';
  el.style.backgroundImage = 'url(Assets/nghs_logo.png)';
  el.style.backgroundSize = '80% 80%';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.width = `${36 * scale}px`;
  el.style.height = `${30 * scale}px`;
  el.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
  el.style.borderRadius = '50%';
  el.style.border = '2px solid #343a40';


  el.style.cursor = 'pointer';
  return el;
}

// -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
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

  // Add the map layers -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
  map.addSource("hexes", {
    type: "geojson",
    data: originalHexGeojson,
  });

  // Add a source for the highlighted hex
  map.addSource("hover-hex", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
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

  // Add hover highlight layer
  map.addLayer({
    id: "hex-hover-outline",
    type: "line",
    source: "hover-hex",
    paint: {
      "line-color": "#000000",
      "line-width": 2,
      "line-opacity": 0.9,
      "line-opacity-transition": {
        duration: 300,
        delay: 0
      },
      "line-width-transition": {
        duration: 300,
        delay: 0
      }
    }
  });

  // Track hover over hex layer
  map.on("mousemove", "visits-choropleth", (e) => {
    const feature = e.features[0];
    const hexId = feature.properties.hex_id;
    const visits = feature.properties.Visits;

    // Only update if we're hovering over a new hexagon
    if (hexId !== hoveredHexId) {
      hoveredHexId = hexId;
      targetHexFeature = feature;
    }

    tooltip.innerHTML = `<strong>Visits:</strong> ${visits.toLocaleString()}`;
    tooltip.style.display = "block";
  });

  // Hide tooltip and clear hover when not hovering
  map.on("mouseleave", "visits-choropleth", () => {
    tooltip.style.display = "none";
    hoveredHexId = null;
    targetHexFeature = null;
  });

  // add common layers
  addCommonLayers(map, currentTheme);

  // Ensure these layers sit on top
  map.moveLayer("ga-county-outline");
  map.moveLayer("ga-county-labels");

  // Add marker for Jefferson Location - larger marker
  new mapboxgl.Marker({
    element: createCustomMarker(1.5), // x% larger than the others
  })
    .setLngLat([-83.5933854224835, 34.10526598277187])
    .setPopup(
      new mapboxgl.Popup({ offset: 38, className: "custom-popup" }).setHTML(
        "<h3>NGPG - Jefferson</h3>"
      )
    )
    .addTo(map);

  // add NGMC - Barrow marker
  new mapboxgl.Marker({
    element: createCustomMarker(1.0),
  })
    .setLngLat([-83.70763029985775, 34.008182535194734])
    .setPopup(
      new mapboxgl.Popup({ offset: 38, className: "custom-popup" }).setHTML(
        "<h3>NGMC - Barrow</h3>"
      )
    )
    .addTo(map);

  // add NGPG - Bethlehem marker
  new mapboxgl.Marker({
    element: createCustomMarker(1.0),
  })
    .setLngLat([-83.75981523447074, 33.94135725379736])
    .setPopup(
      new mapboxgl.Popup({ offset: 38, className: "custom-popup" }).setHTML(
        "<h3>NGPG - Bethlehem</h3>"
      )
    )
    .addTo(map);

  // add NGPG - West Jackson marker
  new mapboxgl.Marker({
    element: createCustomMarker(1.0),
  })
    .setLngLat([-83.70610860246691, 34.10829863586579])
    .setPopup(
      new mapboxgl.Popup({ offset: 38, className: "custom-popup" }).setHTML(
        "<h3>NGPG - West Jackson</h3>"
      )
    )
    .addTo(map);
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

        // Add a source for the highlighted hex in comparison map
        comparisonMap.addSource("comparison-hover-hex", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: []
          }
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

        // Add hover highlight layer for comparison map
        comparisonMap.addLayer({
          id: "comparison-hex-hover-outline",
          type: "line",
          source: "comparison-hover-hex",
          paint: {
            "line-color": "#000000",
            "line-width": 2,
            "line-opacity": 0.9,
            "line-opacity-transition": {
              duration: 300,
              delay: 0
            },
            "line-width-transition": {
              duration: 300,
              delay: 0
            }
          }
        });

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

        // Check if drivetime layers are already enabled on the main map
        // and add them to the comparison map if they are
        checkAndAddEnabledLayers();

        // Add scale control to comparison map
        const comparisonScale = new mapboxgl.ScaleControl({
          maxWidth: 175,
          unit: "imperial",
        });
        comparisonMap.addControl(comparisonScale, "bottom-right");

        // Add marker for Jefferson Location - larger marker
        comparisonMarker = new mapboxgl.Marker({
          element: createCustomMarker(1.5), // 1.5x larger for consistency
        })
          .setLngLat([-83.5933854224835, 34.10526598277187])
          .setPopup(
            new mapboxgl.Popup({
              offset: 38,
              className: "custom-popup",
            }).setHTML("<h3>NGPG - Jefferson</h3>")
          )
          .addTo(comparisonMap);

        // add NGMC - Barrow marker
        new mapboxgl.Marker({
          element: createCustomMarker(1.0),
        })
          .setLngLat([-83.70763029985775, 34.008182535194734])
          .setPopup(
            new mapboxgl.Popup({
              offset: 38,
              className: "custom-popup",
            }).setHTML("<h3>NGMC - Barrow</h3>")
          )
          .addTo(comparisonMap);

        // add NGPG - Bethlehem marker
        new mapboxgl.Marker({
          element: createCustomMarker(1.0),
        })
          .setLngLat([-83.75981523447074, 33.94135725379736])
          .setPopup(
            new mapboxgl.Popup({
              offset: 38,
              className: "custom-popup",
            }).setHTML("<h3>NGPG - Bethlehem</h3>")
          )
          .addTo(comparisonMap);

        // add NGPG - West Jackson marker
        new mapboxgl.Marker({
          element: createCustomMarker(1.0),
        })
          .setLngLat([-83.70610860246691, 34.10829863586579])
          .setPopup(
            new mapboxgl.Popup({
              offset: 38,
              className: "custom-popup",
            }).setHTML("<h3>NGPG West Jackson</h3>")
          )
          .addTo(comparisonMap);

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

// Function to check for enabled layers and add them to the comparison map
function checkAndAddEnabledLayers() {
  // Check if the 10-minute drivetime checkbox is checked
  const checkbox10 = document.getElementById("drivetime-10");
  if (checkbox10 && checkbox10.checked) {
    toggleDrivetimeLayer(
      "drivetime-10",
      "drivetimeSource-10",
      "Data/drivetime_10.geojson",
      true
    );
  }

  const checkbox20 = document.getElementById("drivetime-20");
  if (checkbox20 && checkbox20.checked) {
    toggleDrivetimeLayer(
      "drivetime-20",
      "drivetimeSource-20",
      "Data/drivetime_20.geojson",
      true
    );
  }

  const checkbox30 = document.getElementById("drivetime-30");
  if (checkbox30 && checkbox30.checked) {
    toggleDrivetimeLayer(
      "drivetime-30",
      "drivetimeSource-30",
      "Data/drivetime_30.geojson",
      true
    );
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
      const hexId = feature.properties.hex_id;

      // The key issue: you need to access the 'value' property, not the metricKey
      // In your geojson structure, the actual value is stored in properties.value
      const value = feature.properties.value;

      // Format value based on metric type
      let displayValue = "N/A";

      if (value !== null && value !== undefined && value !== 0) {
        // Apply currency format if needed
        if (currencyPrefixes[metricKey]) {
          displayValue = `${currencyPrefixes[metricKey]
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

      // Update the hover highlight for the appropriate map
      if (mapInstance === comparisonMap) {
        // Only update if we're hovering over a new hexagon
        if (hexId !== hoveredComparisonHexId) {
          hoveredComparisonHexId = hexId;
          targetComparisonHexFeature = feature;
        }
      } else {
        // Main map hover handling
        if (hexId !== hoveredHexId) {
          hoveredHexId = hexId;
          targetHexFeature = feature;
        }
      }
    }
  });

  mapInstance.on("mouseleave", layerId, () => {
    tooltip.style.display = "none";

    // Clear the hover highlight for the appropriate map
    if (mapInstance === comparisonMap) {
      hoveredComparisonHexId = null;
      targetComparisonHexFeature = null;
    } else {
      hoveredHexId = null;
      targetHexFeature = null;
    }
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
  updateChoroplethBreaks(updatedGeojson, departmentValue);
}

// Dynamically update the choropleth breaks based on the data
function updateChoroplethBreaks(geojson, departmentValue) {
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
  updateLegend(breaks, colors, departmentValue);
}

// Function to update the legend
function updateLegend(breaks, colors, departmentValue) {
  const legendItems = document.getElementById("legend-items");

  // Clear existing legend items
  legendItems.innerHTML = "";

  // Add this function to format numbers with thousands separator
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Set department in legend title
  const departmentLabels = {
    Surgical_Associates: "Surgical Associates",
    Urgent_Care: "Urgent Care",
  };

  const departmentDisplayLabel =
    departmentLabels[departmentValue] || departmentValue;

  document.getElementById(
    "legend-title"
  ).innerHTML = `Visits by Hexagon <br/>(${departmentDisplayLabel})`;

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

// Comparison map choropleth section v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-
async function loadComparisonLayer(selectedLayer) {
  // if the comparison layer isn't 'aerial' or 'streets', load it
  if (selectedLayer !== "aerial" && selectedLayer !== "streets") {
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

        // Choose color ramp based on the selected layer
        let colors;
        if (selectedLayer === "median_income") {
          // Green color ramp for Median Income
          colors = [
            "#edf8e9",
            "#c7e9c0",
            "#a1d99b",
            "#74c476",
            "#31a354",
            "#006d2c"
          ];
        } else {
          // Default blue color ramp for other layers
          colors = [
            "#eff3ff",
            "#c6dbef",
            "#9ecae1",
            "#6baed6",
            "#3182bd",
            "#08519c"
          ];
        }

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
  // Format the department name for display
  let displayDepartmentName = departmentValue;
  if (displayDepartmentName.includes("_")) {
    displayDepartmentName = displayDepartmentName.replace(/_/g, " ");
  }
  // Capitalize first letter of each word
  displayDepartmentName = displayDepartmentName
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Get the table container and update the title
  const container = document.getElementById("summary-stats-container");
  const title = container.querySelector("h3") || document.createElement("h3");
  title.innerHTML = `Visits by Drivetime<br><i>(${displayDepartmentName})</i>`;
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
      // 1. Add header row first
      const headerRow = document.createElement("tr");

      const minutesHeaderCell = document.createElement("td");
      minutesHeaderCell.textContent = "Within:";
      minutesHeaderCell.style.fontWeight = "normal";
      headerRow.appendChild(minutesHeaderCell);

      const visitsHeaderCell = document.createElement("td");
      visitsHeaderCell.textContent = "Visits:";
      visitsHeaderCell.style.fontWeight = "normal";
      headerRow.appendChild(visitsHeaderCell);

      const percentHeaderCell = document.createElement("td");
      percentHeaderCell.textContent = "Percentage:";
      percentHeaderCell.style.fontWeight = "normal";
      headerRow.appendChild(percentHeaderCell);

      tableBody.appendChild(headerRow);

      // 2. Drivetime rows with both visits and percentages
      const drivetimeData = [
        {
          label: "10 min",
          visitsColumn: "in_10_visits",
          percentColumn: "in_10_%",
        },
        {
          label: "20 min",
          visitsColumn: "in_20_visits",
          percentColumn: "in_20_%",
        },
        {
          label: "30 min",
          visitsColumn: "in_30_visits",
          percentColumn: "in_30_%",
        },
      ];

      drivetimeData.forEach((item) => {
        const row = document.createElement("tr");

        // Label cell
        const labelCell = document.createElement("td");
        labelCell.textContent = item.label;
        row.appendChild(labelCell);

        // Visits value cell
        const visitsCell = document.createElement("td");
        const visitsValue = departmentRow[item.visitsColumn];
        visitsCell.textContent =
          visitsValue != null
            ? new Intl.NumberFormat().format(visitsValue)
            : "N/A";
        row.appendChild(visitsCell);

        // Percentage value cell
        const percentCell = document.createElement("td");
        const percentValue = departmentRow[item.percentColumn];
        percentCell.textContent =
          percentValue != null
            ? `${parseFloat(percentValue).toFixed(1)}%`
            : "N/A";
        row.appendChild(percentCell);

        tableBody.appendChild(row);
      });

      // 3. Total row at the bottom
      const totalRow = document.createElement("tr");
      totalRow.className = "total-row"; // Add a class for easy identification/debugging

      const totalLabelCell = document.createElement("td");
      totalLabelCell.textContent = "Total";
      totalLabelCell.style.fontWeight = "normal";
      // italicize totalLabelCell
      totalLabelCell.style.fontStyle = "italic";
      totalRow.appendChild(totalLabelCell);

      // Total visits cell
      const totalVisitsCell = document.createElement("td");
      const totalVisits = departmentRow["total_visits"];
      totalVisitsCell.textContent =
        totalVisits != null
          ? new Intl.NumberFormat().format(totalVisits)
          : "N/A";
      totalVisitsCell.style.fontStyle = "italic";
      totalRow.appendChild(totalVisitsCell);

      // Total percentage cell (always 100%)
      const totalPercentCell = document.createElement("td");
      totalPercentCell.textContent = "100.0%";
      totalPercentCell.style.fontStyle = "italic";
      totalRow.appendChild(totalPercentCell);

      // Debug log
      tableBody.appendChild(totalRow);
    } else {
      // If no matching department is found
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3; // Changed from 2 to 3 for the new format with three columns
      td.textContent = `No data available for department: ${departmentValue}`;
      tr.appendChild(td);
      tableBody.appendChild(tr);
    }
  } catch (error) {
    console.error("Error updating summary stats table:", error);

    // Show error message in the table
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3; // Changed from 2 to 3 for the new format with three columns
    td.textContent = `Error loading statistics: ${error.message}`;
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }
}

// Function to load DOT layer data
function loadDOTLayer(layerId, map) {
  // First, check if any previous DOT layers exist and remove them
  const dotLayers = ["dot-uc", "dot-pre"];
  dotLayers.forEach(layer => {
    if (map.getLayer(layer)) {
      map.removeLayer(layer);
    }
    if (map.getLayer(`${layer}-hover`)) {
      map.removeLayer(`${layer}-hover`);
    }
    if (map.getSource(layer)) {
      map.removeSource(layer);
    }
    if (map.getSource(`${layer}-hover`)) {
      map.removeSource(`${layer}-hover`);
    }
  });

  // Path to the GeoJSON file
  const dataPath = `Data/${layerId}.geojson`;

  // Fetch and add the data
  fetch(dataPath)
    .then((response) => response.json())
    .then((data) => {
      // Add as a source
      if (map.getSource(layerId)) {
        map.removeSource(layerId);
      }

      map.addSource(layerId, {
        type: "geojson",
        data: data,
      });

      // Add a hover source and layer for highlighting
      const hoverId = `${layerId}-hover`;

      map.addSource(hoverId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Add the main layer
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }

      map.addLayer({
        id: layerId,
        type: "line",
        source: layerId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": layerId === "dot-uc" ? "#FF6B6B" : "#4ECDC4", // Different colors for each layer
          "line-width": 6,
        },
      });

      // Add the hover layer
      map.addLayer({
        id: hoverId,
        type: "line",
        source: hoverId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": layerId === "dot-uc" ? "#FF9090" : "#7EEEE5", // Lighter version of the original colors
          "line-width": 10,
          "line-opacity": 0.8,
        },
      });

      // Move county labels to top if they exist
      if (map.getLayer("ga-county-labels")) {
        map.moveLayer("ga-county-labels");
      }

      // Create a popup but don't add it to the map yet
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15, // Add a small offset to prevent cursor from overlapping with the popup
        anchor: "bottom", // Keep popup above the cursor
      });

      // Variable to track currently active feature
      let hoveredFeatureId = null;
      let popupTimeout = null;

      // Improve hover experience
      map.on("mousemove", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";

        // Get the hovered feature
        const feature = e.features[0];
        const featureId =
          feature.id ||
          feature.properties.id ||
          JSON.stringify(feature.geometry.coordinates);

        // Clear any existing timeout to avoid popup flashing
        if (popupTimeout) {
          clearTimeout(popupTimeout);
          popupTimeout = null;
        }

        // Only update if we're hovering over a new feature
        if (hoveredFeatureId !== featureId) {
          hoveredFeatureId = featureId;

          // Update the hover source with just this feature
          map.getSource(hoverId).setData({
            type: "FeatureCollection",
            features: [feature],
          });

          // Get the description from the feature
          const description = feature.properties.Desc_short;

          // Create popup content
          const popupContent = `
            <div>
              <p>${description}</p>
              <p><i>Click on project for more information</i></p>
            </div>
          `;

          // Set popup position to current cursor position
          popup.setLngLat(e.lngLat).setHTML(popupContent).addTo(map);
        } else {
          // Just update the popup's position without changing content
          popup.setLngLat(e.lngLat);
        }
      });

      // Add a small delay before removing highlights when leaving the feature
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";

        // Clear hover state with a small delay to prevent flickering
        // when moving between segments of the same line
        popupTimeout = setTimeout(() => {
          hoveredFeatureId = null;
          map.getSource(hoverId).setData({
            type: "FeatureCollection",
            features: [],
          });
          popup.remove();
        }, 100); // Small delay to make the experience smoother
      });

      // Handle click to open URL in a new tab
      map.on("click", layerId, (e) => {
        const feature = e.features[0];
        const url = feature.properties.URL;

        // Check if URL exists and open in a new tab
        if (url) {
          window.open(url, "_blank");
        }
      });
    })
    .catch((error) => {
      console.error(`Error loading ${layerId} data:`, error);
    });
}

// Wait for the DOM & then do a buncha stuff -v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v-v
document.addEventListener("DOMContentLoaded", () => {
  const drawer = document.querySelector("sl-drawer");
  const openBtn = document.querySelector(".openDrawerBtn");
  const openPermitTrackerBtn = document.querySelector(".permitTrackerBtn");
  const closeBtn = drawer.querySelector(".close-button");
  const radioGroup = document.getElementById("theme-radio-container");
  const tooltip = document.getElementById("drawerTooltip");
  const permitTrackerTooltip = document.getElementById("permitTrackerTooltip");
  const closePermitTrackerBtn = document.querySelector(".close-permit-button");
  const compareMapToggle = document.getElementById("compareDemographics");
  const comparisonLayerSelect = document.getElementById("comparisonSelect");
  const checkbox10 = document.getElementById("drivetime-10");
  const checkbox20 = document.getElementById("drivetime-20");
  const checkbox30 = document.getElementById("drivetime-30");
  const competitionCheckbox = document.getElementById("competition");
  const possibleSitesCheckbox = document.getElementById("possible-sites");
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

  // Add event listeners for competition checkbox
  competitionCheckbox.addEventListener("sl-change", (event) => {
    const isChecked = event.target.checked;

    // Handle main map
    competitionMarkers = removeMarkers(competitionMarkers);
    if (isChecked) {
      competitionMarkers = addCompetitionMarkers(map);
    }

    // Handle comparison map if it exists
    if (comparisonMap) {
      comparisonCompetitionMarkers = removeMarkers(comparisonCompetitionMarkers);
      if (isChecked) {
        comparisonCompetitionMarkers = addCompetitionMarkers(comparisonMap);
      }
    }
  });

  // Add event listeners for possible sites checkbox
  possibleSitesCheckbox.addEventListener("sl-change", (event) => {
    const isChecked = event.target.checked;

    // Handle main map
    possibleSiteMarkers = removeMarkers(possibleSiteMarkers);
    if (isChecked) {
      possibleSiteMarkers = addPossibleSiteMarkers(map);
    }

    // Handle comparison map if it exists
    if (comparisonMap) {
      comparisonPossibleSiteMarkers = removeMarkers(comparisonPossibleSiteMarkers);
      if (isChecked) {
        comparisonPossibleSiteMarkers = addPossibleSiteMarkers(comparisonMap);
      }
    }
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

  // show permit tracker tooltip only when hovering
  openPermitTrackerBtn.addEventListener("mouseenter", () => {
    permitTrackerTooltip.show();
  });

  // Hide drawer tooltip when not hovering
  openBtn.addEventListener("mouseleave", () => {
    tooltip.hide();
  });

  // hide permit tracker tooltip when not hovering
  openPermitTrackerBtn.addEventListener("mouseleave", () => {
    permitTrackerTooltip.hide();
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
      if (
        comparisonLayerSelect.value !== "aerial" &&
        comparisonLayerSelect.value !== "streets"
      ) {
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

            // Add markers to comparison map if checkboxes are checked
            if (competitionCheckbox.checked) {
              comparisonCompetitionMarkers = addCompetitionMarkers(comparisonMap);
            }

            if (possibleSitesCheckbox.checked) {
              comparisonPossibleSiteMarkers = addPossibleSiteMarkers(comparisonMap);
            }
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

        // Add markers to comparison map if checkboxes are checked
        if (competitionCheckbox.checked) {
          comparisonCompetitionMarkers = addCompetitionMarkers(comparisonMap);
        }

        if (possibleSitesCheckbox.checked) {
          comparisonPossibleSiteMarkers = addPossibleSiteMarkers(comparisonMap);
        }
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

      // Remove markers from comparison map
      comparisonCompetitionMarkers = removeMarkers(comparisonCompetitionMarkers);
      comparisonPossibleSiteMarkers = removeMarkers(comparisonPossibleSiteMarkers);
    }
  });

  // update comparison map layer based on dropdown menu selection
  comparisonLayerSelect.addEventListener("sl-change", (event) => {
    const selectedLayer = event.target.value;

    // Handle the 'aerial' layer
    if (selectedLayer === "aerial") {
      // Remove any existing choropleth layer
      if (comparisonMap.getLayer("comparison-choropleth")) {
        comparisonMap.removeLayer("comparison-choropleth");
      }

      // Remove any existing choropleth hex outline layer
      if (comparisonMap.getLayer("comparison-hex-outline")) {
        comparisonMap.removeLayer("comparison-hex-outline");
      }

      // Remove sources after removing the layers that depend on them
      if (comparisonMap.getSource("comparison-hexes")) {
        comparisonMap.removeSource("comparison-hexes");
      }

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

      // Wait for the style to finish loading before adding layers back
      comparisonMap.once("style.load", () => {
        // Add county outlines
        comparisonMap.addSource("ga-counties", {
          type: "geojson",
          data: "Data/GA_counties.geojson",
        });

        comparisonMap.addLayer({
          id: "ga-county-outline",
          type: "line",
          source: "ga-counties",
          paint: {
            "line-color": "#ffffff",
            "line-width": 1,
          },
        });
      });

      // remove comparison legend
      document.getElementById("comparison-legend").style.display = "none";

      // remove old marker
      if (comparisonMarker) {
        comparisonMarker.remove();
      }

      // add red marker for aerial view
      comparisonMarker = new mapboxgl.Marker({
        element: createCustomMarker(1.5), // Larger marker with custom logo
      })
        .setLngLat([-83.5933854224835, 34.10526598277187])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - Jefferson</h3>")
        )
        .addTo(comparisonMap);

      // Set cursor style
      comparisonMarker.getElement().style.cursor = "pointer";

      // Clear any existing hover state for comparison map
      hoveredComparisonHexId = null;
      targetComparisonHexFeature = null;
      if (comparisonMap.getSource("comparison-hover-hex")) {
        comparisonMap.getSource("comparison-hover-hex").setData({
          type: "FeatureCollection",
          features: []
        });
      }

      return;
    }

    // Handle the 'streets' layer to show Mapbox Streets layer
    if (selectedLayer === "streets") {
      // Remove any existing choropleth layer
      if (comparisonMap.getLayer("comparison-choropleth")) {
        comparisonMap.removeLayer("comparison-choropleth");
      }

      // Remove any existing choropleth hex outline layer
      if (comparisonMap.getLayer("comparison-hex-outline")) {
        comparisonMap.removeLayer("comparison-hex-outline");
      }

      // Remove sources after removing the layers that depend on them
      if (comparisonMap.getSource("comparison-hexes")) {
        comparisonMap.removeSource("comparison-hexes");
      }

      // Store the current map center and zoom to restore after style change
      const currentCenter = comparisonMap.getCenter();
      const currentZoom = comparisonMap.getZoom();

      comparisonMap.setStyle("mapbox://styles/mapbox/streets-v11");

      // Wait for the style to finish loading before adding layers back
      comparisonMap.once("style.load", () => {
        // Restore previous view state
        comparisonMap.setCenter(currentCenter);
        comparisonMap.setZoom(currentZoom);

        // County outlines
        comparisonMap.addSource("ga-counties", {
          type: "geojson",
          data: "Data/GA_counties.geojson",
        });
        console.log("ga counties source added");

        comparisonMap.addLayer({
          id: "ga-county-outline",
          type: "line",
          source: "ga-counties",
          paint: {
            "line-color": "#000000",
            "line-width": 1,
          },
        });

        // County labels
        comparisonMap.addSource("ga-county-labels", {
          type: "geojson",
          data: "Data/GA_counties_centroids.geojson",
        });

        comparisonMap.addLayer({
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
      });

      // remove comparison legend
      document.getElementById("comparison-legend").style.display = "none";

      // Clear any existing hover state for comparison map
      hoveredComparisonHexId = null;
      targetComparisonHexFeature = null;
      if (comparisonMap.getSource("comparison-hover-hex")) {
        comparisonMap.getSource("comparison-hover-hex").setData({
          type: "FeatureCollection",
          features: []
        });
      }

      return;

    }

    // Handle the new polyline layers
    else if (selectedLayer === "dot-uc" || selectedLayer === "dot-pre") {
      // First remove existing markers
      if (comparisonMarker) {
        comparisonMarker.remove();
      }

      // Remove any existing choropleth layer
      if (comparisonMap.getLayer("comparison-choropleth")) {
        comparisonMap.removeLayer("comparison-choropleth");
      }

      // Remove any existing choropleth hex outline layer
      if (comparisonMap.getLayer("comparison-hex-outline")) {
        comparisonMap.removeLayer("comparison-hex-outline");
      }

      // Remove sources after removing the layers that depend on them
      if (comparisonMap.getSource("comparison-hexes")) {
        comparisonMap.removeSource("comparison-hexes");
      }

      // Add the DOT layer, depending on the selected layer
      loadDOTLayer(selectedLayer, comparisonMap);

      // Re-add the Jefferson marker with custom logo
      comparisonMarker = new mapboxgl.Marker({
        element: createCustomMarker(1.5), // 1.5x larger for consistency
      })
        .setLngLat([-83.5933854224835, 34.10526598277187])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - Jefferson</h3>")
        )
        .addTo(comparisonMap);

      // Re-add other markers
      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.70763029985775, 34.008182535194734])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGMC - Barrow</h3>")
        )
        .addTo(comparisonMap);

      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.75981523447074, 33.94135725379736])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - Bethlehem</h3>")
        )
        .addTo(comparisonMap);

      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.70610860246691, 34.10829863586579])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - West Jackson</h3>")
        )
        .addTo(comparisonMap);

      // remove comparison legend
      document.getElementById("comparison-legend").style.display = "none";

      // Clear any existing hover state for comparison map
      hoveredComparisonHexId = null;
      targetComparisonHexFeature = null;
      if (comparisonMap.getSource("comparison-hover-hex")) {
        comparisonMap.getSource("comparison-hover-hex").setData({
          type: "FeatureCollection",
          features: []
        });
      }

      // ensure basemap style is set to dark / light Carto DB 
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

      // add county outlines
      comparisonMap.addSource("ga-counties", {
        type: "geojson",
        data: "Data/GA_counties.geojson",
      });

      comparisonMap.addLayer({
        id: "ga-county-outline",
        type: "line",
        source: "ga-counties",
        paint: {
          "line-color": "#000000",
          "line-width": 1,
        },
      });

      // add county labels
      comparisonMap.addSource("ga-county-labels", {
        type: "geojson",
        data: "Data/GA_counties_centroids.geojson",
      });

      comparisonMap.addLayer({
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

      return; // Important: return here to prevent the style reset below
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
        element: createCustomMarker(1.5), // Always use custom logo with 1.5x scale
      })
        .setLngLat([-83.5933854224835, 34.10526598277187])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - Jefferson</h3>")
        )
        .addTo(comparisonMap);

      // Re-add any common layers like boundaries, outlines, etc.
      addCommonLayers(comparisonMap, currentTheme);

      // Re-add the data layer
      await loadComparisonLayer(selectedLayer);

      // Re-add the hover source and layer for comparison map
      comparisonMap.addSource("comparison-hover-hex", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      comparisonMap.addLayer({
        id: "comparison-hex-hover-outline",
        type: "line",
        source: "comparison-hover-hex",
        paint: {
          "line-color": "#000000",
          "line-width": 2,
          "line-opacity": 0.9,
          "line-opacity-transition": {
            duration: 300,
            delay: 0
          },
          "line-width-transition": {
            duration: 300,
            delay: 0
          }
        }
      });

      comparisonMap.moveLayer("ga-county-outline");
      comparisonMap.moveLayer("ga-county-labels");

      // Rebind tooltip
      addTooltipHandler(comparisonMap, "comparison-choropleth", selectedLayer);

      // Update legend
      updateComparisonLegend(breaks, colors, selectedLayer);

      // Re-add other main facility markers
      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.70763029985775, 34.008182535194734])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGMC - Barrow</h3>")
        )
        .addTo(comparisonMap);

      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.75981523447074, 33.94135725379736])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - Bethlehem</h3>")
        )
        .addTo(comparisonMap);

      new mapboxgl.Marker({
        element: createCustomMarker(1.0),
      })
        .setLngLat([-83.70610860246691, 34.10829863586579])
        .setPopup(
          new mapboxgl.Popup({
            offset: 38,
            className: "custom-popup",
          }).setHTML("<h3>NGPG - West Jackson</h3>")
        )
        .addTo(comparisonMap);

      // Re-add competition and possible site markers if checkboxes are checked
      if (document.getElementById("competition").checked) {
        comparisonCompetitionMarkers = addCompetitionMarkers(comparisonMap);
      }

      if (document.getElementById("possible-sites").checked) {
        comparisonPossibleSiteMarkers = addPossibleSiteMarkers(comparisonMap);
      }
    });
  });
});

// Function to animate hexagon hover effects
function animateHexHighlight() {
  // Main map animation
  if (targetHexFeature !== currentHexFeature) {
    // If we have a new target or need to clear the current highlight
    if (!targetHexFeature) {
      // Fade out current feature if target is null
      currentHexFeature = null;

      // Set opacity to 0 first (will transition smoothly due to transition settings)
      if (map.getLayer("hex-hover-outline")) {
        map.setPaintProperty("hex-hover-outline", "line-opacity", 0);
      }

      // After the transition completes, clear the data
      setTimeout(() => {
        if (map.getSource("hover-hex")) {
          map.getSource("hover-hex").setData({
            type: "FeatureCollection",
            features: []
          });
        }
      }, 300); // Match the transition duration
    } else {
      // Transition to new feature
      currentHexFeature = targetHexFeature;

      // First update the data
      if (map.getSource("hover-hex")) {
        map.getSource("hover-hex").setData({
          type: "FeatureCollection",
          features: [currentHexFeature]
        });
      }

      // Then ensure opacity is set to full (will transition smoothly)
      if (map.getLayer("hex-hover-outline")) {
        map.setPaintProperty("hex-hover-outline", "line-opacity", 0.9);
      }
    }
  }

  // Comparison map animation
  if (comparisonMap && targetComparisonHexFeature !== currentComparisonHexFeature) {
    // If we have a new target or need to clear the current highlight
    if (!targetComparisonHexFeature) {
      // Fade out current feature if target is null
      currentComparisonHexFeature = null;

      // Set opacity to 0 first (will transition smoothly)
      if (comparisonMap.getLayer("comparison-hex-hover-outline")) {
        comparisonMap.setPaintProperty("comparison-hex-hover-outline", "line-opacity", 0);
      }

      // After the transition completes, clear the data
      setTimeout(() => {
        if (comparisonMap.getSource("comparison-hover-hex")) {
          comparisonMap.getSource("comparison-hover-hex").setData({
            type: "FeatureCollection",
            features: []
          });
        }
      }, 300); // Match the transition duration
    } else {
      // Transition to new feature
      currentComparisonHexFeature = targetComparisonHexFeature;

      // First update the data
      if (comparisonMap.getSource("comparison-hover-hex")) {
        comparisonMap.getSource("comparison-hover-hex").setData({
          type: "FeatureCollection",
          features: [currentComparisonHexFeature]
        });
      }

      // Then ensure opacity is set to full (will transition smoothly)
      if (comparisonMap.getLayer("comparison-hex-hover-outline")) {
        comparisonMap.setPaintProperty("comparison-hex-hover-outline", "line-opacity", 0.9);
      }
    }
  }

  // Continue animation loop
  animationFrameId = requestAnimationFrame(animateHexHighlight);
}

// Start the animation loop
animationFrameId = requestAnimationFrame(animateHexHighlight);

// Define coordinates for Competition and Possible Sites
const competitionSites = [
  { lng: -83.59675251660772, lat: 34.108028099536256, name: "Piedmont - Urgent Care" },
  { lng: -83.41482817571007, lat: 33.96997723688558, name: "Piedmont - Hawthorne" },
  { lng: -83.46563699401626, lat: 33.91609717921617, name: "Piedmont - Oconee Health" },
];

const possibleSites = [
  { lng: -83.5936388995722, lat: 34.10288350800476, name: "Site 1" },
  { lng: -83.43727920680004, lat: 33.992078081742264, name: "Site 2" },
];

// Arrays to store marker references
let competitionMarkers = [];
let possibleSiteMarkers = [];
let comparisonCompetitionMarkers = [];
let comparisonPossibleSiteMarkers = [];

// Function to create a custom pin marker element
function createPinMarker(color) {
  const el = document.createElement('div');
  el.className = 'custom-pin-marker';
  el.style.width = '20px';
  el.style.height = '20px';
  el.style.borderRadius = '50% 50% 50% 0';
  el.style.backgroundColor = color;
  el.style.transform = 'rotate(-45deg)';
  el.style.margin = '0'; // Remove the negative margins
  el.style.borderColor = '#fff';
  el.style.borderStyle = 'solid';
  el.style.borderWidth = '2px';
  el.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
  el.style.cursor = 'pointer'; // Add pointer cursor

  // Add an inner circle
  const inner = document.createElement('div');
  inner.style.width = '10px';
  inner.style.height = '10px';
  inner.style.margin = '3px 0 0 3px';
  inner.style.borderRadius = '50%';
  inner.style.backgroundColor = '#fff';

  el.appendChild(inner);
  return el;
}

// Function to add competition markers
function addCompetitionMarkers(mapInstance) {
  const markers = [];

  competitionSites.forEach(site => {
    const marker = new mapboxgl.Marker({
      element: createPinMarker('#d62828'), // Red pin
      anchor: 'bottom', // Set anchor to bottom of the pin
      offset: [0, 10] // Offset to position the pin's point at the exact coordinates
    })
      .setLngLat([site.lng, site.lat])
      .setPopup(
        new mapboxgl.Popup({
          offset: 25,
          className: "custom-popup"
        }).setHTML(`<h3>${site.name}</h3>`)
      );

    marker.addTo(mapInstance);
    markers.push(marker);
  });

  return markers;
}

// Function to add possible site markers
function addPossibleSiteMarkers(mapInstance) {
  const markers = [];

  possibleSites.forEach(site => {
    const marker = new mapboxgl.Marker({
      element: createPinMarker('#3a86ff'), // Blue pin
      anchor: 'bottom', // Set anchor to bottom of the pin
      offset: [0, 10] // Offset to position the pin's point at the exact coordinates
    })
      .setLngLat([site.lng, site.lat])
      .setPopup(
        new mapboxgl.Popup({
          offset: 25,
          className: "custom-popup"
        }).setHTML(`<h3>${site.name}</h3>`)
      );

    marker.addTo(mapInstance);
    markers.push(marker);
  });

  return markers;
}

// Function to remove markers
function removeMarkers(markers) {
  if (markers && markers.length) {
    markers.forEach(marker => marker.remove());
  }
  return [];
}

// Get references to the main drawer elements
const drawer = document.querySelector('sl-drawer');
const openButton = document.querySelector('.openDrawer');
const closeButton = drawer.querySelector('.close-button');

// Get references to the permit tracker drawer elements
const permitTrackerDrawer = document.querySelector('.permit-tracker-drawer');
const permitTrackerButton = document.querySelector('.permitTrackerBtn');
const closePermitButton = permitTrackerDrawer.querySelector('.close-permit-button');

// Event listeners for the main drawer
openButton.addEventListener('click', () => drawer.show());
closeButton.addEventListener('click', () => drawer.hide());

// Event listeners for the permit tracker drawer
permitTrackerButton.addEventListener('click', () => permitTrackerDrawer.show());
closePermitButton.addEventListener('click', () => permitTrackerDrawer.hide());
