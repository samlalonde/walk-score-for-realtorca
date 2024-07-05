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
            chrome.tabs.sendMessage(tabs[0].id, { action: "getAddress" }, function (response) {
                console.log("Received response from content script:", response);
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                    setElementText('scrapedAddress', 'Error: ' + chrome.runtime.lastError.message + ' If on a REALTOR.ca listing page, please refresh.');
                    return;
                }
                if (response && response.address) {
                    setElementText('scrapedAddress', `Listing Address: ${response.address}`);
                    const parsedAddress = parseAddress(response.address);
                    console.log("Parsed address:", parsedAddress);
                    if (parsedAddress) {
                        // setElementText('parsedAddress', `Parsed Address: Street: ${parsedAddress.street}, City: ${parsedAddress.city}, State: ${parsedAddress.state}, Postal Code: ${parsedAddress.postalCode}`);
                        getLatLong(parsedAddress)
                            .then(coords => {
                                console.log("Received coordinates:", coords);
                                if (coords) {
                                    fetchWalkScore(response.address, coords.lat, coords.lon);
                                } else {
                                    setElementText('scores', 'Error: Could not get coordinates for the address');
                                }
                            })
                            .catch(error => {
                                console.error("Error getting coordinates:", error);
                                setElementText('scores', `Error getting coordinates: ${error.message}`);
                            });
                    } else {
                        console.error("Failed to parse address");
                        setElementText('scores', 'Error: Unable to parse the address');
                    }
                } else {
                    console.error("Address not found in response");
                    setElementText('scrapedAddress', 'Address not found on page');
                }
            });
        } else {
            console.error("No active tab found");
            setElementText('scrapedAddress', 'Error: No active tab found');
        }
    });
}

function setElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    } else {
        console.error(`Element with id '${elementId}' not found`);
    }
}

function parseAddress(address) {
    console.log("Parsing address:", address);
    const regex = /^([^,]+)(?:,\s*#\d+)?\s*,\s*([^\(,]+)\s*(?:\([^\)]+\))?,\s*([^,]+)\s*[A-Z]\d[A-Z]\d[A-Z]\d/;
    const match = address.match(regex);
    console.log(match);

    if (match) {
        return {
            street: match[1].replace("O.", "Ouest").replace("E.", "Est").trim(),
            city: match[2].trim(),
            state: match[3].trim()
        };
    } else {
        console.error('Unable to parse address:', address);
        return null;
    }
}

function getLatLong(parsedAddress) {
    console.log("getLatLong called with:", parsedAddress);
    const { street, city, state } = parsedAddress;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=Canada`;
    // document.getElementById('nominatimUrl').textContent = `Nominatim URL: ${nominatimUrl}`;
    // console.log("Nominatim URL:", nominatimUrl);

    return fetch(nominatimUrl)
        .then(response => response.json())
        .then(data => {
            console.log("Nominatim response:", data);
            if (data && data.length > 0) {
                return { lat: data[0].lat, lon: data[0].lon };
            } else {
                throw new Error('No coordinates found for the address');
            }
        });
}

function fetchWalkScore(address, lat, lon) {
    console.log("fetchWalkScore called with:", address, lat, lon);

    // Retrieve the API key from storage
    chrome.storage.sync.get('walkScoreApiKey', function (data) {
        if (data.walkScoreApiKey) {
            const apiKey = data.walkScoreApiKey;
            // const walkScoreUrl = `https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address)}&lat=${lat}&lon=${lon}&transit=1&bike=1&wsapikey=${apiKey}`;

            // console.log("Walk Score API URL:", walkScoreUrl);

            fetch(walkScoreUrl)
                .then(response => response.json())
                .then(data => {
                    console.log("Walk Score API response:", data);

                    if (data.status === 1) { // 1 means success
                        let scoresHtml = `<p><a href="https://www.walkscore.com/how-it-works/">Walk Score®</a>: <a href="https://www.walkscore.com/how-it-works/">${data.walkscore}</a></p>`;

                        if (data.bike) {
                            scoresHtml += `<p><a href="https://www.walkscore.com/how-it-works/">Bike Score®</a>: <a href="https://www.walkscore.com/how-it-works/">${data.bike.score}</a></p>`;
                        }

                        if (data.transit) {
                            scoresHtml += `<p><a href="https://www.walkscore.com/how-it-works/">Transit Score®</a>: <a href="https://www.walkscore.com/how-it-works/">${data.transit.score}</a></p>`;
                        }

                        document.getElementById('scores').innerHTML = scoresHtml;
                    } else {
                        throw new Error(`Walk Score API error: ${data.description}`);
                    }
                })
                .catch(error => {
                    console.error("Error fetching Walk Score:", error);
                    document.getElementById('scores').textContent = `Error fetching Walk Score: ${error.message}`;
                });
        } else {
            console.error("Walk Score API key not found");
            document.getElementById('scores').textContent = 'Error: Walk Score API key not set';
        }
    });
}