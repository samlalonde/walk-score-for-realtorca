console.log("Content script loaded");

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log("Message received in content script:", request);
    if (request.action === "getAddress") {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        let address = null;

        for (let script of scripts) {
            try {
                const data = JSON.parse(script.textContent);
                if (data["@type"] === "Product" && data.name) {
                    address = data.name;
                    console.log("Found address:", address);
                    break;
                }
            } catch (e) {
                console.error("Error parsing JSON:", e);
            }
        }

        console.log("Sending response with address:", address);
        sendResponse({ address: address });
    }
    return true;
});