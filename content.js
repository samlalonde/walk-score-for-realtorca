console.log("Content script loaded");

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log("Message received in content script:", request);
    if (request.action === "getAddresses") {
        const cards = document.querySelectorAll('.smallListingCard');
        let addresses = [];

        cards.forEach(card => {
            const addressElement = card.querySelector('.smallListingCardAddress');
            const linkElement = card.querySelector('a.blockLink');
            if (addressElement && linkElement) {
                addresses.push({
                    address: addressElement.textContent.trim(),
                    link: linkElement.href
                });
            }
        });

        console.log("Found addresses:", addresses);
        sendResponse({ addresses: addresses });
    }
    return true;
});

