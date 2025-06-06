/**
 * permitChart.js
 * Handles rendering and data management for the building permits chart
 */

// Generate dummy data for 18 months
function generateDummyPermitData() {
    // Hardcoded labels for the 18 months from June 2025 working backwards
    const labels = [
        'Jan 2024', 'Feb 2024', 'Mar 2024', 'Apr 2024', 'May 2024', 'Jun 2024',
        'Jul 2024', 'Aug 2024', 'Sep 2024', 'Oct 2024', 'Nov 2024', 'Dec 2024',
        'Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'
    ];

    const data = [];

    // Generate random data between 20 and 120
    for (let i = 0; i < 18; i++) {
        data.push(Math.floor(Math.random() * 100) + 20);
    }

    return { labels, data };
}

// Initialize the permit chart
function initPermitChart() {
    const permitCanvas = document.getElementById('permitChart');
    if (!permitCanvas) return;

    // Clear any existing chart
    if (window.permitChartInstance) {
        window.permitChartInstance.destroy();
    }

    const { labels, data } = generateDummyPermitData();

    // Determine how many labels to show based on screen width
    const screenWidth = window.innerWidth;
    let xAxisTicksConfig;

    if (screenWidth < 768) {
        // Show fewer labels on mobile
        xAxisTicksConfig = {
            autoSkip: true,
            maxTicksLimit: 6,
            maxRotation: 45,
            minRotation: 45
        };
    } else {
        // Show all labels on desktop
        xAxisTicksConfig = {
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
        };
    }

    // Create new chart
    const chart = new Chart(permitCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Building Permits Issued',
                data: data,
                backgroundColor: 'rgba(52, 58, 64, 0.2)',
                borderColor: 'rgba(52, 58, 64, 1)',
                borderWidth: 2,
                tension: 0, // Set to 0 for straight lines
                pointRadius: 3, // Add small dots at data points
                pointBackgroundColor: 'rgba(52, 58, 64, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointHoverRadius: 5, // Slightly larger on hover
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(52, 58, 64, 1)',
                pointHoverBorderWidth: 2,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide the legend
                },
                title: {
                    display: true,
                    // use array of strings to create multi-line text
                    text: ['Rolling 18-Month Building Permits', ' (fake data)'],
                    font: {
                        size: 18
                    },
                    padding: {
                        top: 0, // Reduced top padding
                        bottom: 20 // Reduced bottom padding
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            return `Permits Issued: ${context.parsed.y}`;
                        }
                    }
                },
                // Add crosshair plugin configuration
                crosshair: {
                    line: {
                        color: '#343a40',  // Same as the chart line color
                        width: 1,
                        dashPattern: [5, 5]  // Dashed line
                    },
                    sync: {
                        enabled: true,  // Enable syncing for multiple charts (if needed in future)
                    },
                    zoom: {
                        enabled: false  // Disable zoom (we just want the crosshair)
                    },
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Permits'
                    }
                },
                x: {
                    display: true, // Ensure x-axis is displayed
                    title: {
                        display: true,
                    },
                    ticks: {
                        ...xAxisTicksConfig,
                        font: {
                            size: 10, // Smaller font for better fit
                            weight: 'bold'
                        },
                        color: '#343a40', // Make sure the text color is visible
                    },
                    grid: {
                        display: false, // Show grid lines for better readability
                        color: 'rgba(0, 0, 0, 0.1)' // Subtle grid lines
                    }
                }
            },
            layout: {
                padding: {
                    top: 5,
                    right: 10,
                    bottom: 50, // Increased bottom padding for rotated labels
                    left: 10
                }
            },
            // Enable hover and line effects
            hover: {
                mode: 'index',
                intersect: false
            }
        },
        plugins: [{
            id: 'verticalLineOnHover',
            beforeDraw: (chart) => {
                if (chart.tooltip?._active?.length) {
                    const activePoint = chart.tooltip._active[0];
                    const { ctx } = chart;
                    const { x } = activePoint.element;
                    const topY = chart.scales.y.top;
                    const bottomY = chart.scales.y.bottom;

                    // Draw vertical line
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = '#343a40';
                    ctx.setLineDash([3, 3]);
                    ctx.stroke();
                    ctx.restore();

                    // Highlight the data point
                    const pointIndex = activePoint.index;
                    const dataset = chart.data.datasets[0];
                    const pointY = chart.scales.y.getPixelForValue(dataset.data[pointIndex]);

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, pointY, 6, 0, 2 * Math.PI);
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = '#343a40';
                    ctx.lineWidth = 2;
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }]
    });

    // Store chart instance globally for later access
    window.permitChartInstance = chart;

    // Force resize after a brief delay to ensure proper rendering
    setTimeout(() => {
        if (chart) chart.resize();
    }, 100);

    // Add window resize handler to update chart on window resize
    window.addEventListener('resize', () => {
        if (window.permitChartInstance) {
            window.permitChartInstance.resize();
        }
    });

    return chart;
}

// Function to load permit data from CSV (placeholder for future implementation)
function loadPermitDataFromCSV(url) {
    // This will be implemented in the future to load real data
    console.log('CSV loading will be implemented in the future from:', url);
    return generateDummyPermitData();
}

// Export functions for use in main script
export { initPermitChart, loadPermitDataFromCSV }; 