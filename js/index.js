const popup = document.getElementById("popup");
const popupDialog = popup.querySelector(".popup");
const popupCloseButton = document.getElementById("popup-close");

popup.addEventListener("click", function (event) {
  if (event.target === popup) {
    closePopup(event);
  }
});

popupDialog.addEventListener("click", function (event) {
  event.stopPropagation();
});

popupCloseButton.addEventListener("click", closePopup);

window.addEventListener('load', function() {
    let imgPopups = document.getElementsByClassName('imgPopup');
    for (let i = 0; i < imgPopups.length; i++) {
      imgPopups[i].style.display = 'block';
    }
});

window.onload = function() {
  const ua = navigator.userAgent.toLowerCase().match(/watch\\b|wear os\\b|huawei watch|gt 2|galaxy watch|android|iphone|ipod|kaios|tizen|harmonyos|bdos/g);

  if (ua) {
    const uTubeLink = document.getElementById('uTubeLink');
    uTubeLink.href = uTubeLink.href.replace('www', 'm');

    // Get the viewport height and multiply it by 1% to get a value for a vh unit
    let vh = window.innerHeight * 0.01;
    // Set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  const uaWatches = navigator.userAgent.toLowerCase().match(/watch\\b|wear os\\b|huawei watch|gt 2|galaxy watch/g);

  if (uaWatches || isSquareScreen()) { 
    popup.style.height = `${window.screen.height}px`;
  }
};

function isSquareScreen() {
  // Get the screen width and height in pixels
  let screenWidth = window.screen.width;
  let screenHeight = window.screen.height;

  // Calculate the difference between width and height
  let diff = Math.abs(screenWidth - screenHeight);

  // Define a threshold for the difference (you can adjust this value)
  const threshold = 10;

  // Return true if the difference is less than or equal to the threshold, false otherwise
  return diff <= threshold;
}

function isPopupOpen() {
  return window.location.hash === "#popup";
}

function closePopup(event) {
  if (event) {
    event.preventDefault();
  }

  if (!isPopupOpen()) {
    return;
  }

  window.location.hash = "";
  const urlWithoutHash = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, "", urlWithoutHash);
  toggleBodyOverflow();
}

document.addEventListener("keydown", function(event) {
  if (event.key === "Escape" && isPopupOpen()) {
    closePopup(event);
  }
});

function toggleBodyOverflow() {
  document.body.classList.toggle("no-scroll", isPopupOpen());
}

document.addEventListener('DOMContentLoaded', function () {
  window.addEventListener('hashchange', toggleBodyOverflow);
  toggleBodyOverflow();
});
