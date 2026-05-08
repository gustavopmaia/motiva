import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import BackgroundService from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import KeepAwake from 'react-native-keep-awake';
import RNFS from 'react-native-fs';
import { captureState } from './src/captureState';
import { backgroundTask, backgroundOptions } from './src/backgroundTask';
import { queueSize } from './src/queue';
import type { AppStatus } from './src/types';

const VEHICLE_ID_KEY = 'cultiva_vehicle_id';
// Camera warm-up time on slow hardware. The camera session opens when
// isActive flips to true; we wait this long before calling takePhoto().
const CAMERA_WARMUP_MS = 1200;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: '#9E9E9E',
  capturing: '#4CAF50',
  offline: '#F44336',
  syncing: '#FF9800',
};

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Idle',
  capturing: 'Capturing',
  offline: 'Offline — queuing',
  syncing: 'Syncing queue',
};

export default function App() {
  const [vehicleId, setVehicleId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  // Controls the camera session. Only true for ~1-2 seconds per capture cycle.
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const cameraRef = useRef<Camera>(null);

  const device = useCameraDevice('back');
  // Target 640×480 — small enough for fast capture and base64 encoding on low-RAM devices.
  const format = useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
  ]);
  const { hasPermission, requestPermission } = useCameraPermission();

  // Load persisted vehicleId on mount
  useEffect(() => {
    AsyncStorage.getItem(VEHICLE_ID_KEY).then(id => {
      if (id) setVehicleId(id);
    });
  }, []);

  const handleVehicleIdChange = useCallback((text: string) => {
    setVehicleId(text);
    AsyncStorage.setItem(VEHICLE_ID_KEY, text);
  }, []);

  // Register the capture function that the background task will call.
  // This function owns the full camera lifecycle for a single capture:
  //   open → warm-up → take photo → close → return base64
  useEffect(() => {
    captureState.captureFn = async (): Promise<string> => {
      setCameraActive(true);
      try {
        // Yield so React can re-render the Camera with isActive=true and the
        // native session has time to open on slow hardware.
        await sleep(CAMERA_WARMUP_MS);

        const cam = cameraRef.current;
        if (!cam) throw new Error('camera ref unavailable');

        const photo = await cam.takePhoto({ qualityPrioritization: 'speed' });
        const photoPath = photo.path.startsWith('file://')
          ? photo.path.slice(7)
          : photo.path;

        const imageBase64 = await RNFS.readFile(photoPath, 'base64');
        await RNFS.unlink(photoPath).catch(() => {});

        return imageBase64;
      } finally {
        // Always close the camera, even if takePhoto() threw.
        setCameraActive(false);
      }
    };

    return () => {
      captureState.captureFn = null;
    };
  }, []); // register once; cameraRef is stable across renders

  // Poll captureState while the service is running so the UI reflects current state
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      setStatus(captureState.currentStatus);
      setCoords(captureState.currentCoords);
      setPendingCount(await queueSize());
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const requestAllPermissions = async (): Promise<boolean> => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('Permission required', 'Camera permission is needed.');
        return false;
      }
    }

    if (Platform.OS === 'android') {
      const result = await Geolocation.requestAuthorization('whenInUse');
      if (result !== 'granted') {
        Alert.alert('Permission required', 'Location permission is needed.');
        return false;
      }
    }

    return true;
  };

  const startService = async () => {
    if (!vehicleId.trim()) return;

    const ok = await requestAllPermissions();
    if (!ok) return;

    captureState.vehicleId = vehicleId.trim();
    captureState.currentStatus = 'capturing';

    await BackgroundService.start(backgroundTask, backgroundOptions);
    setIsRunning(true);
    setStatus('capturing');
  };

  const stopService = async () => {
    await BackgroundService.stop();
    captureState.currentStatus = 'idle';
    setCameraActive(false);
    setIsRunning(false);
    setStatus('idle');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Keep screen on while service is active */}
      {isRunning && <KeepAwake />}

      {/*
        Camera must remain mounted (in JSX) so cameraRef is valid.
        isActive is false between captures — the camera session is fully
        closed, releasing hardware and memory on the old device.
        Size is 4×3 px and invisible so it consumes no GPU resources.
      */}
      {device && (
        <Camera
          ref={cameraRef}
          style={styles.cameraHidden}
          device={device}
          format={format}
          isActive={cameraActive}
          photo
        />
      )}

      <View style={styles.container}>
        <Text style={styles.title}>Cultiva Vehicle</Text>

        {/* Vehicle ID */}
        <View style={styles.field}>
          <Text style={styles.label}>Vehicle ID</Text>
          <TextInput
            style={[styles.input, isRunning && styles.inputDisabled]}
            value={vehicleId}
            onChangeText={handleVehicleIdChange}
            placeholder="e.g. VH-001"
            placeholderTextColor="#757575"
            autoCapitalize="characters"
            editable={!isRunning}
          />
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <View
            style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]}
          />
          <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
        </View>

        {/* GPS */}
        <Text style={styles.coords}>
          {coords
            ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`
            : 'No GPS fix yet'}
        </Text>

        {/* Queue */}
        <Text style={styles.queue}>
          {pendingCount === 0
            ? 'Queue empty'
            : `${pendingCount} frame${pendingCount === 1 ? '' : 's'} queued`}
        </Text>

        {/* Start / Stop */}
        <TouchableOpacity
          style={[
            styles.button,
            isRunning ? styles.buttonStop : styles.buttonStart,
            !vehicleId.trim() && !isRunning && styles.buttonDisabled,
          ]}
          onPress={isRunning ? stopService : startService}
          disabled={!vehicleId.trim() && !isRunning}>
          <Text style={styles.buttonText}>{isRunning ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1B5E20',
  },
  // 4×3 px invisible view — must be positive size for VisionCamera to function,
  // but contributes nothing to layout or GPU.
  cameraHidden: {
    position: 'absolute',
    width: 4,
    height: 3,
    opacity: 0,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#A5D6A7',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: '#2E7D32',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#388E3C',
  },
  inputDisabled: {
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  coords: {
    fontSize: 14,
    color: '#C8E6C9',
    fontFamily: 'monospace',
  },
  queue: {
    fontSize: 14,
    color: '#C8E6C9',
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#66BB6A',
  },
  buttonStop: {
    backgroundColor: '#EF5350',
  },
  buttonDisabled: {
    backgroundColor: '#388E3C',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
