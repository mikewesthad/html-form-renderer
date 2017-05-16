p5.disableFriendlyErrors = true; // For faster performance

var canvas, capture, loadingSpinner;
var videoWidth = null;
var videoHeight = null;
var threshold = 255 / 2;
var drawDebug = false;
var isLoaded = false;

// Sampling to reduce number of pixels that are processed from the capture
var sampleSize = 8;

// Display scaling, 1px of the image = 12px scrollbar
var displaySize = 12;

// Number of scrollbars to use for rendering
var scrollRows = 6; // Set number of rows to a fixed number ahead of time
var scrollCols = null; // Columns determined by num samples in video width
var scrollbars = [];

function setup() {
  // Invisible canvas, for debugging
  canvas = createCanvas(windowWidth, windowHeight);
  if (!drawDebug) canvas.elt.style.display = "none";

  // Set up a video capture
  capture = createCapture(VIDEO);
  capture.size(640, 480);
  capture.hide();

  // Wait until the stream has loaded a frame before doing any processing
  capture.elt.addEventListener("loadeddata", function () {
    videoWidth = this.videoWidth;
    videoHeight = this.videoHeight;

    // Number of columns is the number samples that are pulled from video width
    scrollCols = ceil(videoWidth / sampleSize);

    var displayScale = displaySize / sampleSize; // Video to screen coords

    // Resize the canvas so that it can be centered
    resizeCanvas(
      videoWidth * displayScale,
      videoHeight * displayScale
    );

    // Center the scroll frame container on the screen
    select("#scroll-frame").position(
      (windowWidth / 2) - (scrollCols * displaySize / 2),
      (windowHeight / 2) - (videoHeight * displayScale / 2)
    );

    // Create the scrollbar "canvas"
    initScrollbars();

    // Everything is in order, start the draw loop
    isLoaded = true;
  });
}

function windowResized() {
    // Center the scroll frame container again
    var displayScale = displaySize / sampleSize; // Video to screen coords
    select("#scroll-frame").position(
      (windowWidth / 2) - (scrollCols * displaySize / 2),
      (windowHeight / 2) - (videoHeight * displayScale / 2)
    );
}

function initScrollbars() {
  var displayScale = displaySize / sampleSize; // Video to screen coords
  var rowHeight = (videoHeight * displayScale) / scrollRows; // In screen coords

  for (var r = 0; r < scrollRows; r += 1) {
    for (var c = 0; c < scrollCols; c += 1) {
      // Create scrollbar
      //  - Scrollbar "pixels" are displaySize wide
      //  - The height of a scrollbar is determined by the number of rows
      var scrollbar = createScrollbar(
        c * displaySize,
        r * rowHeight,
        displaySize,
        rowHeight
      );

      // Store the scrollbar in a 1D array
      scrollbars.push(scrollbar);
    }
  }
}

function renderScrollbarFrame() {
  for (var c = 0; c < scrollCols; c += 1) {
    for (var r = 0; r < scrollRows; r += 1) {
      // Figure out the coordinates of the scrollbar in video pixel space
      var h = videoHeight / scrollRows;
      var x = c * sampleSize;
      var yStart = r * h;
      var yEnd = yStart + h;

      // Find the largest rectangle of dark pixels underneath the scrollbar
      var rectangle = fitScrollbar(x, yStart, yEnd);

      // Find the index of the scrollbar in the 1D scrollbars array
      var i = (r * scrollCols) + c;

      // Calculate scrollbar's scroll offset and size so that it matches the
      // rectangle
      var offsetFraction = (rectangle.y - yStart) / h;
      var heightFraction = rectangle.h / h;
      renderToScrollbar(i, offsetFraction, heightFraction);
    }
  }
}

function renderToScrollbar(i, fractionOffset, fractionSize) {
  // If the size fraction is 1, the scrollbar won't show since all of the
  // content is visible. Use this "feature" to handle drawing a full scrollbar
  // or an empty scrollbar.
  if (fractionSize >= 1) fractionSize = 0.99;
  else if (fractionSize <= 0) fractionSize = 1;

  var displayScale = displaySize / sampleSize; // Video to screen coords
  var rowHeight = (videoHeight * displayScale) / scrollRows; // In screen coords

  // Inner div needs to be larger than the outer div to get a scrollbar thumb.
  // The size of this div needs to be larger, the smaller the thumb should be.
  var innerSize = (1 / fractionSize) * rowHeight;

  // The scroll position is how far down the inner div we should be scrolled, so
  // this needs to be a fraction of the inner div's size
  var scrollPos = fractionOffset * innerSize;

  scrollbars[i].content.size(displaySize, innerSize);
  scrollbars[i].container.elt.scrollTop = scrollPos;
}

function createScrollbar(x, y, w, h) {
  var scrollContainer = createElement("div");
  scrollContainer.attribute("class", "scroll-container");
  var scrollContent = createElement("div");
  scrollContent.attribute("class", "scroll-content");
  scrollContent.parent(scrollContainer);
  scrollContainer.parent("#scroll-frame");
  scrollContainer.size(w, h);
  scrollContainer.position(x, y);
  return {
    container: scrollContainer,
    content: scrollContent
  };
}

function draw() {
    if (!isLoaded) return;

    // Make the camera pixels available
    capture.loadPixels();

    // Debug drawing
    if (drawDebug) {
      clear();
      drawBinaryDebug(200, 0, 255, 50);
    }

    renderScrollbarFrame();
}

function fitScrollbar(sectionX, sectionY, sectionHeight) {
  var rectangle = { x: sectionX, y: sectionY, w: sampleSize, h: 0 };
  var tallestRectangle = { x: sectionX, y: sectionY, w: sampleSize, h: 0 };
  var cPixels = capture.pixels;

  for (var y = sectionY; y < sectionHeight; y += sampleSize) {

    // Get gray value
    var i = 4 * (y * videoWidth + sectionX);
    var gray = rgbToGray(cPixels[i], cPixels[i + 1], cPixels[i + 2]);

    // Threshold
    if (gray > threshold) {

      // White pixel, current rectangle is finished
      if (rectangle.h > tallestRectangle.h) {
        // New tallest rectangle found
        tallestRectangle.y = rectangle.y;
        tallestRectangle.h = rectangle.h;
      }

      // Reset rectangle
      rectangle.y = null;
      rectangle.h = null;

    } else {

      // Black pixel
      if ((rectangle.y === null) || (rectangle.h === null)) {
        // First pixel in rectangle
        rectangle.y = y;
        rectangle.h = sampleSize;
      } else {
        // Continuing an existing rectangle
        rectangle.h += sampleSize;
      }

    }
  }

  // Finished looping, so check the last rectangle that was being built in case
  // it is the largest
  if ((rectangle.y !== null) && (rectangle.h !== null)) {
    if (rectangle.h > tallestRectangle.h) {
      // New tallest rectangle
      tallestRectangle.y = rectangle.y;
      tallestRectangle.h = rectangle.h;
    }
  }

  return tallestRectangle;
}

function rgbToGray(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawBinaryDebug(r, g, b, a) {
  var displayScale = displaySize / sampleSize; // Video to screen coordinates
  var cPixels = capture.pixels;

  for (var x = 0; x < videoWidth; x += sampleSize) {
    for (var y = 0; y < videoHeight; y += sampleSize) {

      // Get grayscale color
      var i = 4 * (y * videoWidth + x);
      var gray = rgbToGray(cPixels[i], cPixels[i + 1], cPixels[i + 2]);

      // Threshold
      if (gray < threshold) {
        // Draw pixel rectangle
        noStroke();
        fill(r, g, b, a);
        rect(x * displayScale, y * displayScale, displaySize, displaySize);
      }
    }
  }
}

function keyPressed() {
  if (keyCode === DOWN_ARROW) {
    threshold -= 10;
    if (threshold < 0) threshold = 0;
  } else if (keyCode === UP_ARROW) {
    threshold += 10;
    if (threshold > 255) threshold = 255;
  }
}

function keyReleased() {
  if (key.toLowerCase() === "d") {
    drawDebug = !drawDebug;
    if (drawDebug) {
      canvas.elt.style.display = "";
    } else {
      canvas.elt.style.display = "none";
    }
  }
}