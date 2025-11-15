import {
  Gemini,
  GeminiLiveWebsocket,
} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";

import { AudioProcessor } from "RemoteServiceGateway.lspkg/Helpers/AudioProcessor";
import { DynamicAudioOutput } from "RemoteServiceGateway.lspkg/Helpers/DynamicAudioOutput";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GeminiTypes";
import { MicrophoneRecorder } from "RemoteServiceGateway.lspkg/Helpers/MicrophoneRecorder";
import { VideoController } from "RemoteServiceGateway.lspkg/Helpers/VideoController";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

require("LensStudio:RawLocationModule");

// Embedded memory layer: curated safe places in Espoo, Finland (subset; demo-only).
// For flexibility, the same data also exists as JSON in Assets/Scripts/data/safe_places_espoo.json
interface SafePlace {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}

const SAFE_PLACES_ESPOO: SafePlace[] = [
  {
    id: "keilaniemi_metro",
    name: "Keilaniemi Metro Station",
    category: "Metro Station",
    latitude: 60.1789,
    longitude: 24.8323,
  },
  {
    id: "aalto_metro",
    name: "Aalto University Metro Station",
    category: "Metro Station",
    latitude: 60.1844,
    longitude: 24.8276,
  },
  {
    id: "tapiola_metro",
    name: "Tapiola Metro Station",
    category: "Metro Station",
    latitude: 60.1773,
    longitude: 24.805,
  },
  {
    id: "tapiola_bus_terminal",
    name: "Tapiola Bus Terminal",
    category: "Bus Station",
    latitude: 60.1781,
    longitude: 24.8046,
  },
  {
    id: "matinkyla_metro",
    name: "Matinkylä Metro Station",
    category: "Metro Station",
    latitude: 60.1583,
    longitude: 24.7372,
  },
  {
    id: "iso_omena",
    name: "Iso Omena Shopping Centre",
    category: "Shopping Centre",
    latitude: 60.1599,
    longitude: 24.7386,
  },
  {
    id: "leppavaara_station",
    name: "Leppävaara Railway Station",
    category: "Train Station",
    latitude: 60.2196,
    longitude: 24.8123,
  },
  {
    id: "sello",
    name: "Sello Shopping Centre",
    category: "Shopping Centre",
    latitude: 60.2201,
    longitude: 24.8127,
  },
  {
    id: "espoo_centre_station",
    name: "Espoo Centre (Espoon keskus) Station",
    category: "Train Station",
    latitude: 60.2053,
    longitude: 24.6594,
  },
  {
    id: "espoonlahti_metro",
    name: "Espoonlahti Metro Station",
    category: "Metro Station",
    latitude: 60.145,
    longitude: 24.654,
  },
  {
    id: "espoo_police",
    name: "Espoo Police Station (Nihtisilta)",
    category: "Police Station",
    latitude: 60.2178,
    longitude: 24.8005,
  },
  {
    id: "a_bloc",
    name: "A Bloc (Otaniemi)",
    category: "Shopping Centre",
    latitude: 60.1849,
    longitude: 24.8277,
  },
];

@component
export class GeminiAssistant extends BaseScriptComponent {
  @ui.separator
  @ui.label(
    "Example of connecting to the Gemini Live API. Change various settings in the inspector to customize!"
  )
  @ui.separator
  @ui.separator
  @ui.group_start("Setup")
  @input
  private websocketRequirementsObj: SceneObject;
  @input private dynamicAudioOutput: DynamicAudioOutput;
  @input private microphoneRecorder: MicrophoneRecorder;
  @ui.group_end
  @ui.separator
  @ui.group_start("Inputs")
  @input
  @widget(new TextAreaWidget())
  private instructions: string =
    "You are a helpful assistant that loves to make puns";
  @input private haveVideoInput: boolean = false;
  @ui.group_end
  @ui.separator
  @ui.group_start("Outputs")
  @ui.label(
    '<span style="color: yellow;">⚠️ To prevent audio feedback loop in Lens Studio Editor, use headphones or manage your microphone input.</span>'
  )
  @input
  private haveAudioOutput: boolean = false;
  @input
  @showIf("haveAudioOutput", true)
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Puck", "Puck"),
      new ComboBoxItem("Charon", "Charon"),
      new ComboBoxItem("Kore", "Kore"),
      new ComboBoxItem("Fenrir", "Fenrir"),
      new ComboBoxItem("Aoede", "Aoede"),
      new ComboBoxItem("Leda", "Leda"),
      new ComboBoxItem("Orus", "Orus"),
      new ComboBoxItem("Zephyr", "Zephyr"),
    ])
  )
  private voice: string = "Puck";
  @ui.group_end
  @ui.separator
  private audioProcessor: AudioProcessor = new AudioProcessor();
  private videoController: VideoController = new VideoController(
    1500,
    CompressionQuality.HighQuality,
    EncodingType.Jpg
  );
  private GeminiLive: GeminiLiveWebsocket;

  // Location state sourced from Spectacles RawLocationModule
  private latitude: number;
  private longitude: number;
  private altitude: number;
  private horizontalAccuracy: number;
  private verticalAccuracy: number;
  private timestamp: Date;
  private locationSource: string;
  private headingDegrees: number;
  private locationService: any;
  private repeatUpdateUserLocation: any;

  public updateTextEvent: Event<{ text: string; completed: boolean }> =
    new Event<{ text: string; completed: boolean }>();

  public functionCallEvent: Event<{
    name: string;
    args: any;
    callId?: string;
  }> = new Event<{
    name: string;
    args: any;
  }>();

  onAwake() {
    // Initialize location tracking so we always have up-to-date
    // GPS coordinates and heading before/while talking to Gemini.
    this.createEvent("OnStartEvent").bind(() => {
      this.initializeLocationService();
    });

    this.repeatUpdateUserLocation = this.createEvent("DelayedCallbackEvent");
    this.repeatUpdateUserLocation.bind(() => {
      if (!this.locationService) {
        return;
      }

      this.locationService.getCurrentPosition(
        (geoPosition) => {
          const newTimestampMs = geoPosition.timestamp.getTime();
          if (
            !this.timestamp ||
            this.timestamp.getTime() !== newTimestampMs
          ) {
            this.latitude = geoPosition.latitude;
            this.longitude = geoPosition.longitude;
            this.horizontalAccuracy = geoPosition.horizontalAccuracy;
            this.verticalAccuracy = geoPosition.verticalAccuracy;
            this.locationSource = geoPosition.locationSource;

            if (geoPosition.altitude !== 0) {
              this.altitude = geoPosition.altitude;
            }

            this.timestamp = geoPosition.timestamp;

            print(
              "Location update - lat: " +
                this.latitude +
                ", long: " +
                this.longitude +
                ", source: " +
                this.locationSource
            );
          }
        },
        (error) => {
          print("Location error: " + error);
        }
      );

      // Acquire next location update in 1 second; adjust if needed.
      this.repeatUpdateUserLocation.reset(1.0);
    });
  }

  private initializeLocationService() {
    try {
      // Create location handler
      this.locationService = GeoLocation.createLocationService();
      // Use navigation accuracy for best AR alignment at walking speeds
      this.locationService.accuracy = GeoLocationAccuracy.Navigation;

      // Heading / orientation updates (north aligned)
      this.locationService.onNorthAlignedOrientationUpdate.add(
        (northAlignedOrientation) => {
          const heading = GeoLocation.getNorthAlignedHeading(
            northAlignedOrientation
          );
          this.headingDegrees = heading;
        }
      );

      // Start location updates immediately
      this.repeatUpdateUserLocation.reset(0.0);
    } catch (e) {
      print("Failed to initialize location service: " + e);
    }
  }

  createGeminiLiveSession() {
    this.websocketRequirementsObj.enabled = true;
    this.dynamicAudioOutput.initialize(24000);
    this.microphoneRecorder.setSampleRate(16000);

    // Display internet connection status
    let internetStatus = global.deviceInfoSystem.isInternetAvailable()
      ? "Websocket connected"
      : "No internet";

    this.updateTextEvent.invoke({ text: internetStatus, completed: true });

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      internetStatus = args.isInternetAvailable
        ? "Reconnected to internete"
        : "No internet";

      this.updateTextEvent.invoke({ text: internetStatus, completed: true });
    });

    this.GeminiLive = Gemini.liveConnect();

    this.GeminiLive.onOpen.add((event) => {
      print("Connection opened");
      this.sessionSetup();
    });

    let completedTextDisplay = true;

    this.GeminiLive.onMessage.add((message) => {
      print("Received message: " + JSON.stringify(message));
      // Setup complete, begin sending data
      if (message.setupComplete) {
        message = message as GeminiTypes.Live.SetupCompleteEvent;
        print("Setup complete");
        this.setupInputs();
      }

      if (message?.serverContent) {
        message = message as GeminiTypes.Live.ServerContentEvent;
        // Playback the audio response
        if (
          message?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.mimeType?.startsWith(
            "audio/pcm"
          )
        ) {
          let b64Audio =
            message.serverContent.modelTurn.parts[0].inlineData.data;
          let audio = Base64.decode(b64Audio);
          this.dynamicAudioOutput.addAudioFrame(audio);
        }
      if (message.serverContent.interrupted) {
          this.dynamicAudioOutput.interruptAudioOutput();
        }
        // Show output transcription
        else if (message?.serverContent?.outputTranscription?.text) {
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: message.serverContent.outputTranscription?.text,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: message.serverContent.outputTranscription?.text,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Show text response
        else if (message?.serverContent?.modelTurn?.parts?.[0]?.text) {
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: message.serverContent.modelTurn.parts[0].text,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: message.serverContent.modelTurn.parts[0].text,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Determine if the response is complete
        else if (message?.serverContent?.turnComplete) {
          completedTextDisplay = true;
        }
      }

      if (message.toolCall) {
        message = message as GeminiTypes.Live.ToolCallEvent;
        print("Tool call received: " + JSON.stringify(message));

        // Handle tool calls
        message.toolCall.functionCalls.forEach((functionCall) => {
          // Built-in location tool: respond directly from this component
          if (functionCall.name === "get_user_location") {
            const locationResponse = this.buildLocationToolPayload();
            const responseJson = JSON.stringify(locationResponse);

            print(
              "get_user_location tool invoked. Payload: " + responseJson
            );

            this.sendFunctionCallUpdate(functionCall.name, responseJson);
          } else if (functionCall.name === "get_nearby_places") {
            const placesResponse = this.buildNearbyPlacesPayload();
            const responseJson = JSON.stringify(placesResponse);
            print("get_nearby_places tool invoked. Payload: " + responseJson);
            this.sendFunctionCallUpdate(functionCall.name, responseJson);
          } else {
            // Forward any other tools (e.g., Snap3D) to external handlers
            this.functionCallEvent.invoke({
              name: functionCall.name,
              args: functionCall.args,
            });
          }
        });
      }
    });

    this.GeminiLive.onError.add((event) => {
      print("Error: " + event);
    });

    this.GeminiLive.onClose.add((event) => {
      print("Connection closed: " + event.reason);
    });
  }

  public streamData(stream: boolean) {
    if (stream) {
      if (this.haveVideoInput) {
        this.videoController.startRecording();
      }

      this.microphoneRecorder.startRecording();
    } else {
      if (this.haveVideoInput) {
        this.videoController.stopRecording();
      }

      this.microphoneRecorder.stopRecording();
    }
  }

  private setupInputs() {
    this.audioProcessor.onAudioChunkReady.add((encodedAudioChunk) => {
      const message = {
        realtime_input: {
          media_chunks: [
            {
              mime_type: "audio/pcm",
              data: encodedAudioChunk,
            },
          ],
        },
      } as GeminiTypes.Live.RealtimeInput;
      this.GeminiLive.send(message);
    });

    // Configure the microphone
    this.microphoneRecorder.onAudioFrame.add((audioFrame) => {
      this.audioProcessor.processFrame(audioFrame);
    });

    if (this.haveVideoInput) {
      // Configure the video controller
      this.videoController.onEncodedFrame.add((encodedFrame) => {
        const message = {
          realtime_input: {
            media_chunks: [
              {
                mime_type: "image/jpeg",
                data: encodedFrame,
              },
            ],
          },
        } as GeminiTypes.Live.RealtimeInput;
        this.GeminiLive.send(message);
      });
    }
  }

  public sendFunctionCallUpdate(functionName: string, args: string): void {
    const messageToSend = {
      tool_response: {
        function_responses: [
          {
            name: functionName,
            response: { content: args },
          },
        ],
      },
    } as GeminiTypes.Live.ToolResponse;

    this.GeminiLive.send(messageToSend);
  }

  private sessionSetup() {
    let generationConfig = {
      responseModalities: ["AUDIO"],
      temperature: 1,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.voice,
          },
        },
      },
    } as GeminiTypes.Common.GenerationConfig;

    if (!this.haveAudioOutput) {
      generationConfig = {
        responseModalities: ["TEXT"],
      };
    }

    // Define available tools for Gemini Live
    const tools = [
      {
        function_declarations: [
          {
            name: "Snap3D",
            description: "Generates a 3D model based on a text prompt",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description:
                    "The text prompt to generate a 3D model from. Cartoonish styles work best. Use 'full body' when generating characters.",
                },
              },
              required: ["prompt"],
            },
          },
          {
            name: "get_user_location",
            description:
              "Returns the user's latest known GPS coordinates, altitude, accuracy and heading from Spectacles.",
            parameters: {
              // No arguments required; always returns the most recent location.
              type: "object",
              properties: {},
            },
          },
          {
            name: "get_nearby_places",
            description:
              "Returns curated nearby safer places in Espoo, Finland (e.g., metro stations, shopping centres), filtered by distance from the user's current location.",
            parameters: {
              // MVP: no arguments; uses current user location.
              type: "object",
              properties: {},
            },
          },
        ],
      },
    ];

    // Build system instruction, enriched with the user's current
    // real-world position (if available) so Gemini knows where
    // you are when the session begins.
    let systemInstructionText =
      this.getSafetyRoleInstruction() +
      "\n\n" +
      (this.instructions ? this.instructions : "");

    if (this.latitude !== undefined && this.longitude !== undefined) {
      systemInstructionText +=
        "\n\nUser current real-world location (from Spectacles):\n" +
        "- latitude: " +
        this.latitude.toFixed(6) +
        "\n" +
        "- longitude: " +
        this.longitude.toFixed(6) +
        "\n";

      if (this.altitude !== undefined) {
        systemInstructionText +=
          "- altitudeMeters: " + this.altitude.toFixed(1) + "\n";
      }

      if (this.horizontalAccuracy !== undefined) {
        systemInstructionText +=
          "- horizontalAccuracyMeters: " +
          this.horizontalAccuracy.toFixed(1) +
          "\n";
      }

      if (this.headingDegrees !== undefined) {
        systemInstructionText +=
          "- headingDegreesFromNorth: " + this.headingDegrees.toFixed(1) + "\n";
      }
    }

    // Send the session setup message
    let modelUri = `models/gemini-2.0-flash-live-preview-04-09`;
    const sessionSetupMessage = {
      setup: {
        model: modelUri,
        generation_config: generationConfig,
        system_instruction: {
          parts: [
            {
              text: systemInstructionText,
            },
          ],
        },
        tools: tools,
        contextWindowCompression: {
          triggerTokens: 20000,
          slidingWindow: { targetTokens: 16000 },
        },
        output_audio_transcription: {},
      },
    } as GeminiTypes.Live.Setup;
    this.GeminiLive.send(sessionSetupMessage);
  }

  // Build a structured payload for the get_user_location Gemini tool.
  private buildLocationToolPayload(): any {
    if (this.latitude === undefined || this.longitude === undefined) {
      print("get_user_location requested but location is not yet available.");
      return {
        success: false,
        error:
          "Location is not available yet. Ensure location permission is granted and wait for a GPS fix.",
      };
    }

    const payload: any = {
      success: true,
      latitude: this.latitude,
      longitude: this.longitude,
    };

    if (this.altitude !== undefined) {
      payload.altitudeMeters = this.altitude;
    }

    if (this.horizontalAccuracy !== undefined) {
      payload.horizontalAccuracyMeters = this.horizontalAccuracy;
    }

    if (this.verticalAccuracy !== undefined) {
      payload.verticalAccuracyMeters = this.verticalAccuracy;
    }

    if (this.headingDegrees !== undefined) {
      payload.headingDegreesFromNorth = this.headingDegrees;
    }

    if (this.locationSource !== undefined) {
      payload.locationSource = this.locationSource;
    }

    if (this.timestamp !== undefined) {
      payload.timestampMs = this.timestamp.getTime();
    }

    return payload;
  }

  // Build a structured payload for the get_nearby_places Gemini tool.
  private buildNearbyPlacesPayload(): any {
    if (this.latitude === undefined || this.longitude === undefined) {
      print("get_nearby_places requested but location is not yet available.");
      return {
        success: false,
        error:
          "Location is not available yet. Ensure location permission is granted and wait for a GPS fix.",
      };
    }

    // Compute distance and bearing to each curated place, sort by distance.
    const withDistance = SAFE_PLACES_ESPOO.map((p) => {
      const distanceMeters = this.computeDistanceMeters(
        this.latitude,
        this.longitude,
        p.latitude,
        p.longitude
      );
      const bearingFromNorth = this.computeBearingDegrees(
        this.latitude,
        this.longitude,
        p.latitude,
        p.longitude
      );
      const distanceText = this.formatDistanceMeters(distanceMeters);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceMeters: Math.round(distanceMeters),
        distanceText: distanceText,
        bearingDegreesFromNorth: Math.round(bearingFromNorth),
      };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);

    // Limit results to the closest 6 to keep responses concise.
    const top = withDistance.slice(0, 6);

    return {
      success: true,
      userLocation: {
        latitude: this.latitude,
        longitude: this.longitude,
        headingDegreesFromNorth:
          this.headingDegrees !== undefined ? this.headingDegrees : null,
      },
      places: top,
      note:
        "This is a curated, demo-only list of busier/safer public venues in Espoo for MVP.",
    };
  }

  // Great-circle distance using Haversine formula.
  private computeDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180.0;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Initial bearing from point 1 to point 2, normalized to [0, 360)
  private computeBearingDegrees(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180.0;
    const toDeg = (rad: number) => (rad * 180.0) / Math.PI;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const λ1 = toRad(lon1);
    const λ2 = toRad(lon2);
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    const bearing = (toDeg(θ) + 360.0) % 360.0;
    return bearing;
  }

  // Safety-first role prompt injected into system_instruction.
  private getSafetyRoleInstruction(): string {
    return (
      "You are a safety-aware night companion. Your primary goal is to keep the user calm and informed.\n" +
      "- Always ground advice in the provided location and nearby places.\n" +
      "- Prefer busier, well-lit venues (metro stations, shopping centres, cafés, hotels, transit stops).\n" +
      "- When asked about safety, first call get_user_location, then get_nearby_places to contextualize guidance.\n" +
      "- If information is uncertain or stale, say so and choose conservative guidance.\n" +
      "- Be concise, supportive, and avoid alarming language. Offer clear next steps and distances.\n" +
      "- Output format requirement: Return plain text only. Do NOT use Markdown or any special formatting (no bullet points, code fences, headings, links, or inline markup)."
    );
  }

  // Simple distance formatting fallback (e.g., "850 m" or "1.4 km").
  private formatDistanceMeters(distanceMeters: number): string {
    if (distanceMeters >= 1000) {
      const km = distanceMeters / 1000;
      const rounded = Math.round(km * 10) / 10; // one decimal
      return rounded + " km";
    }
    return Math.round(distanceMeters) + " m";
  }

  public interruptAudioOutput(): void {
    if (this.dynamicAudioOutput && this.haveAudioOutput) {
      this.dynamicAudioOutput.interruptAudioOutput();
    } else {
      print("DynamicAudioOutput is not initialized.");
    }
  }
}
