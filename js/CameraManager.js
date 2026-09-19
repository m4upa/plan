/**
 * CameraManager.js
 * Owns the camera stream lifecycle: requesting permission, starting,
 * stopping, and releasing resources. No pose logic here.
 */
const CameraManager = (() => {
  let stream = null;
  let videoEl = null;

  async function start(videoElement, { facingMode = 'environment' } = {}) {
    videoEl = videoElement;

    // Diagnostic: some Android WebViews (depending on how the wrapper app
    // is built) never expose navigator.mediaDevices at all, or expose it
    // but without getUserMedia. This is the #1 reason the OS permission
    // dialog never appears — the call never reaches the point where
    // Android would ask, because the JS API itself isn't there.
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.error('CameraManager: navigator.mediaDevices.getUserMedia is not available.', {
        hasMediaDevices: !!navigator.mediaDevices,
        isSecureContext: window.isSecureContext,
        protocol: location.protocol,
        userAgent: navigator.userAgent,
      });
      throw new Error('UNSUPPORTED');
    }

    // getUserMedia silently refuses to work on an insecure origin (must be
    // https:// or a WebView's special "trusted" scheme). A plain file://
    // page loaded without the wrapper marking it secure will reach this
    // point but the call below will hang or reject without ever prompting.
    if (!window.isSecureContext) {
      console.error('CameraManager: not a secure context, camera API will not prompt.', {
        protocol: location.protocol,
        href: location.href,
      });
      throw new Error('INSECURE_CONTEXT');
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error('CameraManager: getUserMedia rejected', err && err.name, err && err.message);
      // Normalize error types for UI layer
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        throw new Error('PERMISSION_DENIED');
      }
      if (err && err.name === 'NotFoundError') {
        throw new Error('NO_CAMERA');
      }
      if (err && err.name === 'NotReadableError') {
        throw new Error('CAMERA_IN_USE');
      }
      throw new Error('UNKNOWN: ' + (err && err.message ? err.message : String(err)));
    }

    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(resolve);
      };
    });

    return {
      width: videoEl.videoWidth,
      height: videoEl.videoHeight,
    };
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  function isActive() {
    return !!stream && stream.getTracks().some(t => t.readyState === 'live');
  }

  return { start, stop, isActive };
})();
