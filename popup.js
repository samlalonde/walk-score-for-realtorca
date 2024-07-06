document.addEventListener('DOMContentLoaded', function () {
    console.log("Popup DOM fully loaded");

    // Check if we have an API key, if not, show the input
    chrome.storage.sync.get('walkScoreApiKey', function (data) {
        if (!data.walkScoreApiKey) {
            document.getElementById('apiKeyInput').style.display = 'block';
        } else {
            fetchScores();
        }
    });

    // Add event listener for saving API key
    document.getElementById('saveKey').addEventListener('click', function () {
        const apiKey = document.getElementById('apiKey').value;
        chrome.storage.sync.set({ walkScoreApiKey: apiKey }, function () {
            console.log('Walk Score API key saved');
            document.getElementById('apiKeyInput').style.display = 'none';
            fetchScores();
        });
    });
});

function fetchScores() {
    console.log("fetchScores called");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        console.log("Active tab query completed");
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getAddresses" }, function (response) {
                console.log("Received response from content script:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                    appendToTable('Error', '', 'Error: ' + chrome.runtime.lastError.message + ' If on a REALTOR.ca listing page, please refresh.');
                    return;
                }
                if (response && response.addresses) {
                    const addresses = response.addresses.slice(0, 20); // Limit to 20 addresses

                    // Process addresses sequentially to avoid API rate limits
                    addresses.reduce((promise, address) => {
                        return promise.then(() => processAddress(address));
                    }, Promise.resolve());
                } else {
                    console.error("Addresses not found in response");
                    appendToTable('Error', '', 'Addresses not found on page');
                }
            });
        } else {
            console.error("No active tab found");
            appendToTable('Error', '', 'No active tab found');
        }
    });
}

function appendToTable(addressObj, walkScore = '', bikeScore = '', transitScore = '', medianScore = '') {
    const tbody = document.getElementById('scores');
    const row = document.createElement('tr');
    const addressCell = document.createElement('td');
    const listingCell = document.createElement('td');
    const medianScoreCell = document.createElement('td');
    const walkScoreCell = document.createElement('td');
    const bikeScoreCell = document.createElement('td');
    const transitScoreCell = document.createElement('td');
    const mapCell = document.createElement('td');

    const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressObj.address)}`;
    addressCell.innerHTML = addressObj.address; // Plain text address
    listingCell.innerHTML = `<a href="${addressObj.link}" target="_blank">Listing</a>`; // Listing link
    medianScoreCell.innerHTML = medianScore || ''; // Leave blank if not provided
    walkScoreCell.innerHTML = walkScore || ''; // Leave blank if not provided
    bikeScoreCell.innerHTML = bikeScore || ''; // Leave blank if not provided
    transitScoreCell.innerHTML = transitScore || ''; // Leave blank if not provided
    mapCell.innerHTML = `<a href="${mapLink}" target="_blank">Location</a>`;

    row.appendChild(addressCell);
    row.appendChild(listingCell);
    row.appendChild(medianScoreCell);
    row.appendChild(walkScoreCell);
    row.appendChild(bikeScoreCell);
    row.appendChild(transitScoreCell);
    row.appendChild(mapCell);
    tbody.appendChild(row);
}

function parseAddress(address) {
    console.log("Parsing address:", address);
    // Remove apartment number if present
    const addressWithoutApt = address.replace(/,\s*#\w*\d+\w*/, '').replace(/\([^)]*\)/, '').trim();
    console.log("Address without apartment number:", addressWithoutApt);

    // Replace directional abbreviations
    const addressReplacedDirections = addressWithoutApt
        .replace(/\bO\b\./, 'Ouest')
        .replace(/\bE\b\./, 'Est')
        .replace(/\bW\b\./, 'West')
        .replace(/\bN\b\./, 'North')
        .replace(/\bS\b\./, 'South');
    console.log("Address with replaced directions:", addressReplacedDirections);

    // General regex to capture most addresses
    const regex = /^(.+?),\s*([^,]+?),\s*([^,]+)$/;
    const match = addressReplacedDirections.match(regex);
    console.log("Regex match result:", match);

    if (match) {
        return {
            street: match[1].trim(),
            city: match[2].trim(),
            state: match[3].trim()
        };
    } else {
        console.error('Unable to parse address:', addressReplacedDirections);
        return null;
    }
}

function getLatLong(parsedAddress) {
    console.log("getLatLong called with:", parsedAddress);
    const { street, city, state } = parsedAddress;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=Canada`;

    return fetch(nominatimUrl)
        .then(response => response.json())
        .then(data => {
            console.log("Nominatim response:", data);
            if (data && data.length > 0) {
                return { lat: data[0].lat, lon: data[0].lon };
            } else {
                throw new Error('No coordinates found for the address');
            }
        })
        .catch(error => {
            console.error("Error fetching coordinates from Nominatim:", error);
            throw error;
        });
}

function calculateMedianScore(walkScore, bikeScore, transitScore) {
    const scores = [walkScore, bikeScore, transitScore].filter(score => score !== undefined && score !== '').map(Number);
    const total = scores.reduce((sum, score) => sum + score, 0);
    return (total / scores.length).toFixed(2);
}

function fetchWalkScore(address, lat, lon) {
    console.log("fetchWalkScore called with:", address, lat, lon);

    // Retrieve the API key from storage
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get('walkScoreApiKey', function (data) {
            if (data.walkScoreApiKey) {
                const apiKey = data.walkScoreApiKey;
                const walkScoreUrl = `https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address.address)}&lat=${lat}&lon=${lon}&transit=1&bike=1&wsapikey=${apiKey}`;

                fetch(walkScoreUrl)
                    .then(response => response.json())
                    .then(data => {
                        console.log("Walk Score API response:", data);

                        if (data.status === 1) { // 1 means success
                            const walkScore = data.walkscore || 0;
                            const bikeScore = data.bike ? data.bike.score : 0;
                            const transitScore = data.transit ? data.transit.score : 0;
                            const medianScore = calculateMedianScore(walkScore, bikeScore, transitScore);

                            appendToTable(address, walkScore, bikeScore, transitScore, medianScore);
                            resolve();
                        } else {
                            throw new Error(`Walk Score API error: ${data.description}`);
                        }
                    })
                    .catch(error => {
                        console.error("Error fetching Walk Score:", error);
                        appendToTable(address, `Error fetching Walk Score: ${error.message}`, '', '', '');
                        reject(error);
                    });
            } else {
                console.error("Walk Score API key not found");
                appendToTable(address, 'Error: Walk Score API key not set', '', '', '');
                reject(new Error('Walk Score API key not set'));
            }
        });
    });
}

let retryCount = {}; // Keep track of retries for each address

function processAddress(address) {
    const parsedAddress = parseAddress(address.address);
    console.log("Parsed address:", parsedAddress);
    
    if (!retryCount[address.address]) retryCount[address.address] = 0; // Initialize retry count if not set

    if (parsedAddress) {
        return getLatLong(parsedAddress)
            .then(coords => {
                console.log("Received coordinates:", coords);
                if (coords) {
                    return fetchWalkScore(address, coords.lat, coords.lon);
                } else {
                    appendToTable(address, '', '', '', ''); // Leave blank if no coordinates found
                    return Promise.resolve(); // Continue to the next address
                }
            })
            .catch(error => {
                console.error("Error getting coordinates:", error);
                if (error.message.includes('No coordinates found for the address')) {
                    appendToTable(address, '', '', '', ''); // Leave blank if no coordinates found
                } else {
                    if (retryCount[address.address] < 3) { // Retry up to 3 times
                        retryCount[address.address]++;
                        return processAddress(address); // Retry the same address
                    } else {
                        appendToTable(address, `Error getting coordinates: ${error.message}`, '', '', '');
                    }
                }
                return Promise.resolve(); // Continue to the next address
            });
    } else {
        appendToTable(address, 'Error: Unable to parse the address', '', '', '');
        return Promise.resolve(); // Continue to the next address
    }
}
