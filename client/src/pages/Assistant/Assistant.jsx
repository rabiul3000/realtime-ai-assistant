import { useState, useEffect, useRef, useCallback } from "react";

// Paste your own Deepgram API key here.
// Do not commit a permanent API key to a public repository.
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API;

const CONNECTION_TIMEOUT_MS = 15000;
const FIRST_RESULT_TIMEOUT_MS = 20000;
const AUDIO_WATCHDOG_MS = 10000;

const Assistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Store each finalized transcription segment separately.
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [diagnostics, setDiagnostics] = useState([]);

  const [audioStats, setAudioStats] = useState({
    chunks: 0,
    bytes: 0,
    lastChunk: "None",
    lastResult: "None",
    socket: "Disconnected",
  });

  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const containerRef = useRef(null);

  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const audioChunkCountRef = useRef(0);
  const receivedResultRef = useRef(false);
  const lastChunkTimeRef = useRef(0);
  const timersRef = useRef([]);

  const log = useCallback((message, type = "info") => {
    const time = new Date().toLocaleTimeString();

    console[type === "error" ? "error" : "log"](
      `[Transcriber ${time}] ${message}`
    );

    setDiagnostics((previous) =>
      [
        ...previous,
        {
          id: `${Date.now()}-${Math.random()}`,
          time,
          message,
          type,
        },
      ].slice(-60)
    );
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));

    timersRef.current = [];
  }, []);

  const addTimer = useCallback((callback, delay) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
    return timer;
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();

    const recorder = recorderRef.current;
    const stream = streamRef.current;
    const socket = socketRef.current;

    recorderRef.current = null;
    streamRef.current = null;
    socketRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onerror = null;

      try {
        recorder.stop();
      } catch (error) {
        console.warn("Recorder cleanup failed:", error);
      }
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close();
      } catch (error) {
        console.warn("WebSocket cleanup failed:", error);
      }
    }
  }, [clearTimers]);

  const stopDeepgramLive = useCallback(() => {
    // Invalidate callbacks belonging to the previous session.
    sessionRef.current += 1;

    activeRef.current = false;
    startingRef.current = false;

    cleanup();

    setIsListening(false);
    setIsConnecting(false);
    setStatusMsg("");

    log("Session stopped; resources released.");
  }, [cleanup, log]);

  // Automatically scroll down as transcript or logs grow.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcriptLines, interimTranscript, diagnostics]);

  // Clean up if the component is removed from the page.
  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      activeRef.current = false;
      startingRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const startDeepgramLive = async () => {
    if (startingRef.current || activeRef.current) {
      return;
    }

    startingRef.current = true;

    const sessionId = ++sessionRef.current;

    audioChunkCountRef.current = 0;
    receivedResultRef.current = false;
    lastChunkTimeRef.current = 0;

    setDiagnostics([]);
    setErrorMsg("");
    setTranscriptLines([]);
    setInterimTranscript("");

    setAudioStats({
      chunks: 0,
      bytes: 0,
      lastChunk: "None",
      lastResult: "None",
      socket: "Connecting",
    });

    setIsConnecting(true);
    setIsListening(false);
    setStatusMsg("Checking browser support...");

    const fail = (message) => {
      if (sessionId !== sessionRef.current) return;

      log(message, "error");

      setErrorMsg(message);
      setStatusMsg("");
      setIsConnecting(false);
      setIsListening(false);

      startingRef.current = false;
      activeRef.current = false;

      cleanup();
    };

    try {
      // STEP 1: Validate API key configuration.
      if (
        !DEEPGRAM_API_KEY ||
        DEEPGRAM_API_KEY === "YOUR_DEEPGRAM_API_KEY_HERE"
      ) {
        fail("Set your Deepgram API key in DEEPGRAM_API_KEY.");
        return;
      }

      log("STEP 1: API key is configured.");

      // STEP 2: Validate browser capabilities.
      if (!window.isSecureContext) {
        fail("Use HTTPS or localhost to access the microphone.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fail("This browser does not support microphone capture.");
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        fail("MediaRecorder is not supported by this browser.");
        return;
      }

      if (typeof WebSocket === "undefined") {
        fail("WebSocket is not supported by this browser.");
        return;
      }

      log("STEP 2: Browser audio and WebSocket APIs are available.");

      // STEP 3: Capture the default microphone/input.
      setStatusMsg("Requesting microphone access...");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (sessionId !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const audioTracks = stream.getAudioTracks();

      if (!audioTracks.length) {
        fail("No audio tracks were found.");
        return;
      }

      audioTracks.forEach((track) => {
        log(
          `Audio device: ${track.label || "Default input"}; enabled=${
            track.enabled
          }; muted=${track.muted}`
        );
      });

      log("STEP 3: Microphone permission granted.");

      // STEP 4: Find a supported recording format.
      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];

      const mimeType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!mimeType && !MediaRecorder.isTypeSupported("")) {
        fail("No supported MediaRecorder audio format was found.");
        return;
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      log(`STEP 4: Recorder format: ${recorder.mimeType || "Browser default"}`);

      // STEP 5: Connect to Deepgram Nova-3.
      setStatusMsg("Connecting to Deepgram Nova-3...");

      const params = new URLSearchParams({
        model: "nova-3",
        interim_results: "true",
        smart_format: "true",
        punctuate: "true",
      });

      const socket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params.toString()}`,
        ["token", DEEPGRAM_API_KEY]
      );

      socketRef.current = socket;

      addTimer(() => {
        if (
          sessionId === sessionRef.current &&
          socket.readyState === WebSocket.CONNECTING
        ) {
          fail(
            "Connection timed out. Check your network, API key and Deepgram service."
          );
        }
      }, CONNECTION_TIMEOUT_MS);

      socket.onopen = () => {
        if (sessionId !== sessionRef.current || socketRef.current !== socket) {
          socket.close();
          return;
        }

        activeRef.current = true;
        startingRef.current = false;

        log("STEP 5: WebSocket opened successfully.");

        setAudioStats((previous) => ({
          ...previous,
          socket: "Connected",
        }));

        // STEP 6: Stream audio chunks to Deepgram.
        recorder.ondataavailable = (event) => {
          if (sessionId !== sessionRef.current) return;

          if (!event.data || event.data.size === 0) {
            log("Empty audio chunk received.", "error");
            return;
          }

          audioChunkCountRef.current += 1;
          lastChunkTimeRef.current = Date.now();

          const chunkCount = audioChunkCountRef.current;
          const chunkBytes = event.data.size;

          setAudioStats((previous) => ({
            ...previous,
            chunks: chunkCount,
            bytes: previous.bytes + chunkBytes,
            lastChunk: `${chunkBytes} bytes`,
          }));

          if (socket.readyState !== WebSocket.OPEN) {
            log("Audio chunk produced, but WebSocket is not open.", "error");
            return;
          }

          try {
            socket.send(event.data);

            if (chunkCount === 1 || chunkCount % 20 === 0) {
              log(`Audio sent: chunk ${chunkCount}, ${chunkBytes} bytes.`);
            }
          } catch (error) {
            log(`Audio send failed: ${error.message}`, "error");
          }
        };

        recorder.onerror = (event) => {
          if (sessionId !== sessionRef.current) return;

          const detail = event.error?.message || "Unknown recorder error";

          fail(`Audio recorder error: ${detail}`);
        };

        try {
          recorder.start(250);

          setIsConnecting(false);
          setIsListening(true);
          setStatusMsg("Connected! Waiting for audio results...");

          log("STEP 6: MediaRecorder started.");

          // STEP 7: Check whether audio chunks are being generated.
          addTimer(() => {
            if (sessionId !== sessionRef.current) return;

            if (audioChunkCountRef.current === 0) {
              fail(
                "No audio chunks were generated. Check microphone permissions and the selected recording device."
              );
            }
          }, 4000);

          // STEP 8: Check whether any transcription results arrive.
          addTimer(() => {
            if (sessionId !== sessionRef.current || receivedResultRef.current) {
              return;
            }

            log(
              "No transcription result yet. Check that the input contains audible speech and inspect the logs.",
              "error"
            );

            setStatusMsg("Connected, but waiting for recognizable speech...");
          }, FIRST_RESULT_TIMEOUT_MS);

          // STEP 9: Detect a stalled audio stream.
          const watchdog = () => {
            if (sessionId !== sessionRef.current) return;

            if (
              activeRef.current &&
              lastChunkTimeRef.current > 0 &&
              Date.now() - lastChunkTimeRef.current > AUDIO_WATCHDOG_MS
            ) {
              fail(
                "Audio stream stalled. The recorder stopped producing audio chunks."
              );
              return;
            }

            addTimer(watchdog, 3000);
          };

          addTimer(watchdog, 5000);
        } catch (error) {
          fail(`Could not start MediaRecorder: ${error.message}`);
        }
      };

      // STEP 10: Process Deepgram messages.
      socket.onmessage = (event) => {
        if (sessionId !== sessionRef.current) return;

        let message;

        try {
          message = JSON.parse(event.data);
        } catch (error) {
          log(`Invalid JSON from Deepgram: ${error.message}`, "error");
          return;
        }

        if (message.type === "Metadata") {
          log(
            `Deepgram metadata received. Request ID: ${
              message.request_id || "Unknown"
            }`
          );
          return;
        }

        if (message.type === "Error") {
          const detail =
            message.description ||
            message.message ||
            message.err_msg ||
            JSON.stringify(message);

          fail(`Deepgram API error: ${detail}`);
          return;
        }

        if (message.type === "Warning") {
          log(
            `Deepgram warning: ${
              message.description || JSON.stringify(message)
            }`,
            "error"
          );
          return;
        }

        if (message.type !== "Results") {
          log(`Deepgram event: ${message.type || "Unknown type"}`);
          return;
        }

        const alternative = message.channel?.alternatives?.[0];
        const text = alternative?.transcript || "";

        if (!text.trim()) return;

        receivedResultRef.current = true;

        setAudioStats((previous) => ({
          ...previous,
          lastResult: new Date().toLocaleTimeString(),
        }));

        setStatusMsg("Connected! Transcribing audio live...");

        if (message.is_final) {
          // Each finalized segment becomes its own vertical line.
          setTranscriptLines((previous) => [...previous, text]);

          // Clear the interim line after finalizing a segment.
          setInterimTranscript("");

          log(`Final transcript received: "${text}"`);
        } else {
          // Show changing speech as a live preview underneath.
          setInterimTranscript(text);
        }
      };

      socket.onerror = () => {
        if (sessionId !== sessionRef.current) return;

        log(
          "WebSocket error. Browsers may hide the server's detailed reason; inspect the Network tab.",
          "error"
        );

        setErrorMsg(
          "WebSocket error. Check authentication, network access and the browser Network tab."
        );
      };

      socket.onclose = (event) => {
        if (sessionId !== sessionRef.current) return;

        log(
          `WebSocket closed: code=${event.code}, reason=${
            event.reason || "No reason supplied"
          }`
        );

        cleanup();

        activeRef.current = false;
        startingRef.current = false;

        setIsListening(false);
        setIsConnecting(false);
        setStatusMsg("");

        setAudioStats((previous) => ({
          ...previous,
          socket: "Disconnected",
        }));

        if (event.code !== 1000) {
          setErrorMsg(
            `Connection closed unexpectedly (code ${event.code}). Check the diagnostic logs.`
          );
        }
      };
    } catch (error) {
      if (sessionId !== sessionRef.current) return;

      let message = error.message || "Unknown error";

      if (error.name === "NotAllowedError") {
        message = "Microphone permission was denied.";
      } else if (error.name === "NotFoundError") {
        message = "No microphone or audio input device was found.";
      } else if (error.name === "NotReadableError") {
        message = "The microphone may be busy or unavailable.";
      }

      fail(message);
    }
  };

  const clearTranscript = () => {
    setTranscriptLines([]);
    setInterimTranscript("");
  };

  const copyDiagnostics = () => {
    const report = diagnostics
      .map((item) => `[${item.time}] ${item.message}`)
      .join("\n");

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(report).catch((error) => {
        log(`Unable to copy diagnostics: ${error.message}`, "error");
      });
    } else {
      log("Clipboard access unavailable; copy logs from the screen.", "error");
    }
  };

  return (
    <div className="card bg-base-200 shadow-xl max-w-2xl mx-auto my-8 flex">
      <div className="card-body">
        <h2 className="card-title border-b pb-3 mb-2">
          Deepgram Nova-3 Live Transcriber
        </h2>

        {errorMsg && (
          <div role="alert" className="alert alert-error mb-3">
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={startDeepgramLive}
            disabled={isListening || isConnecting}
            className="btn btn-primary"
          >
            {isConnecting ? "Connecting..." : "▶ Start Transcription"}
          </button>

          <button
            type="button"
            onClick={stopDeepgramLive}
            disabled={!isListening && !isConnecting}
            className="btn btn-error"
          >
            ⏹ Stop
          </button>

          <button
            type="button"
            onClick={clearTranscript}
            className="btn btn-neutral"
          >
            Clear Transcript
          </button>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 mb-3 text-info">
            {(isConnecting || isListening) && (
              <span className="loading loading-spinner loading-xs" />
            )}
            <span>{statusMsg}</span>
          </div>
        )}

        <div className="stats stats-vertical sm:stats-horizontal shadow mb-4">
          <div className="stat">
            <div className="stat-title">Audio chunks</div>
            <div className="stat-value text-lg">{audioStats.chunks}</div>
          </div>

          <div className="stat">
            <div className="stat-title">Bytes sent</div>
            <div className="stat-value text-lg">
              {audioStats.bytes.toLocaleString()}
            </div>
          </div>

          <div className="stat">
            <div className="stat-title">WebSocket</div>
            <div className="stat-value text-sm">{audioStats.socket}</div>
          </div>
        </div>

        {/* Vertical transcription display */}
        <div
          ref={containerRef}
          aria-live="polite"
          aria-label="Live transcription"
          className="mockup-code bg-base-300 text-base-content p-4 min-h-55 max-h-100 overflow-y-auto"
        >
          <div className="flex flex-col gap-2 text-base leading-relaxed">
            {transcriptLines.length === 0 && !interimTranscript ? (
              <p className="opacity-60 italic whitespace-normal">
                Start transcription and speak into your selected audio input...
              </p>
            ) : (
              <>
                {transcriptLines.map((line, index) => (
                  <p
                    key={index}
                    className="w-full whitespace-normal wrap-break-word"
                  >
                    {line}
                  </p>
                ))}

                {interimTranscript && (
                  <p className="w-full whitespace-normal wrap-break-word opacity-60 italic">
                    {interimTranscript}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Diagnostic logs */}
        <div className="collapse collapse-arrow bg-base-300 mt-4">
          <input type="checkbox" defaultChecked />

          <div className="collapse-title font-semibold">
            Diagnostic logs ({diagnostics.length})
          </div>

          <div className="collapse-content">
            <button
              type="button"
              className="btn btn-sm btn-outline mb-3"
              onClick={copyDiagnostics}
            >
              Copy logs
            </button>

            <div className="max-h-64 overflow-y-auto text-xs font-mono space-y-2">
              {diagnostics.map((item) => (
                <div key={item.id} className="w-full flex flex-col">
                  <span className="opacity-60">[{item.time}]</span>

                  <span className={item.type === "error" ? "text-error" : ""}>
                    {item.message}
                  </span>
                </div>
              ))}

              {diagnostics.length === 0 && <p>No diagnostic events yet.</p>}
            </div>
          </div>
        </div>

        <p className="text-xs opacity-70 mt-3">
          This component records your selected microphone/input device. System
          audio requires a suitable loopback input or another supported capture
          method.
        </p>
      </div>
    </div>
  );
};

export default Assistant;
