/**
 * PoseDetector.js
 * Thin wrapper around MediaPipe Tasks Vision PoseLandmarker.
 * Responsible ONLY for: loading the model, running inference on a
 * video frame, and returning normalized landmarks + a named-point map.
 *
 * If the model or WASM runtime cannot be loaded, isSupported() will
 * be false and the app must show a real "not supported" message —
 * never a fake/simulated detector.
 *
 * All model/WASM assets are loaded from local /libs paths. Nothing
 * here reaches out to a CDN or the internet.
 */
const PoseDetector = (() => {
  let landmarker = null;
  let supported = false;
  let lastError = null;

  // MediaPipe pose landmark indices we care about (BlazePose 33-point topology)
  const LANDMARK_INDEX = {
    nose: 0,
    leftShoulder: 11, rightShoulder: 12,
    leftElbow: 13, rightElbow: 14,
    leftWrist: 15, rightWrist: 16,
    leftHip: 23, rightHip: 24,
    leftKnee: 25, rightKnee: 26,
    leftAnkle: 27, rightAnkle: 28,
  };

  /**
   * Resolves a project-relative path (e.g. 'libs/mediapipe/vision_bundle.mjs')
   * against the location of the current HTML document, NOT against this
   * script file. This matters because html2app.dev (and browsers in
   * general) may load app.js's siblings from a 'js/' subfolder while
   * 'libs/' sits next to index.html — using document.baseURI keeps every
   * path anchored to one consistent root regardless of which file is
   * doing the resolving.
   */
  function resolveFromDocument(relativePath) {
    return new URL(relativePath, document.baseURI).href;
  }

  async function loadWithDelegate(wasmBasePath, modelAssetPath, delegate) {
    const bundleUrl = resolveFromDocument(`${wasmBasePath}/vision_bundle.mjs`);
    const wasmBaseUrl = resolveFromDocument(wasmBasePath);
    const modelUrl = resolveFromDocument(modelAssetPath);

    // vision_bundle.mjs is an ES module; imported dynamically by absolute
    // URL so this file itself can stay a plain script loaded via <script>.
    const visionModule = await import(bundleUrl);
    const { PoseLandmarker, FilesetResolver } = visionModule;

    const filesetResolver = await FilesetResolver.forVisionTasks(wasmBaseUrl);

    return PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: modelUrl,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  async function init({
    wasmBasePath = 'libs/mediapipe',
    modelAssetPath = 'libs/models/pose_landmarker_lite.task',
  } = {}) {
    try {
      landmarker = await loadWithDelegate(wasmBasePath, modelAssetPath, 'GPU');
      supported = true;
      lastError = null;
      return true;
    } catch (err) {
      console.warn('PoseDetector: GPU init failed, retrying on CPU', err);
      lastError = err;
      supported = false;

      // Retry once with CPU delegate — some Android WebViews lack WebGL
      // support required for the GPU delegate.
      try {
        landmarker = await loadWithDelegate(wasmBasePath, modelAssetPath, 'CPU');
        supported = true;
        lastError = null;
        return true;
      } catch (err2) {
        console.warn('PoseDetector: CPU fallback also failed', err2);
        lastError = err2;
        supported = false;
        return false;
      }
    }
  }

  function isSupported() {
    return supported;
  }

  function getLastError() {
    return lastError;
  }

  /**
   * Runs inference on a single video frame.
   * @param {HTMLVideoElement} videoEl
   * @param {number} timestampMs - must be monotonically increasing
   * @returns {object|null} named landmark map with {x,y,z,visibility} per point, or null if no pose found
   */
  function detect(videoEl, timestampMs) {
    if (!supported || !landmarker) return null;

    let result;
    try {
      result = landmarker.detectForVideo(videoEl, timestampMs);
    } catch (err) {
      console.warn('PoseDetector: detectForVideo failed', err);
      return null;
    }

    if (!result || !result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    const raw = result.landmarks[0]; // numPoses = 1
    const named = {};
    for (const [name, idx] of Object.entries(LANDMARK_INDEX)) {
      const p = raw[idx];
      named[name] = p
        ? { x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }
        : { x: 0, y: 0, z: 0, visibility: 0 };
    }

    return named;
  }

  function close() {
    if (landmarker) {
      try { landmarker.close(); } catch (e) { /* noop */ }
      landmarker = null;
    }
    supported = false;
  }

  return { init, isSupported, getLastError, detect, close, LANDMARK_INDEX };
})();
