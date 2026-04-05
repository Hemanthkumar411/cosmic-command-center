import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Download, Wifi, WifiOff, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/appStore';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { DetectionLog } from './DetectionLog';
import { SpectrumControls } from './SpectrumControls';
import { MetricsGrid } from './MetricsGrid';
import { runDetectionPipeline, DetectionResult, LogEntry } from '@/lib/dspEngine';
import { exportSignalData } from '@/lib/exportData';
import { SignalData } from '@/types/satellite';

export const SignalMonitor = () => {
  const { monitoringSatellite: sat, setMonitoringSatellite } = useAppStore();
  const [piConnected, setPiConnected] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [anomalyDetected, setAnomalyDetected] = useState(false);

  // Controls
  const [enableIntf, setEnableIntf] = useState(true);
  const [enableMaxHold, setEnableMaxHold] = useState(false);
  const [enableMinHold, setEnableMinHold] = useState(false);
  const [smoothEnabled, setSmoothEnabled] = useState(false);
  const [smoothAlpha, setSmoothAlpha] = useState(0.0);

  // Hold data refs
  const maxHoldRef = useRef<Float64Array | null>(null);
  const minHoldRef = useRef<Float64Array | null>(null);
  const psdAvgRef = useRef<Float64Array | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const frameCountRef = useRef(0);

  // For metrics grid compatibility
  const [latestMetrics, setLatestMetrics] = useState<SignalData | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setPiConnected(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const processFrame = useCallback(() => {
    if (!sat) return;
    frameCountRef.current++;

    const result = runDetectionPipeline(
      enableIntf,
      false, // gap
      enableMaxHold,
      enableMinHold,
      maxHoldRef.current,
      minHoldRef.current,
      smoothEnabled,
      smoothAlpha,
      psdAvgRef.current,
    );

    maxHoldRef.current = result.maxHold;
    minHoldRef.current = result.minHold;
    psdAvgRef.current = result.psdAvg;

    setDetectionResult(result);

    // Update anomaly state
    const hasInterference = result.interferences.length > 0;
    setAnomalyDetected(hasInterference);

    // Generate metrics for the MetricsGrid
    const avgHealth = hasInterference ? 55 + Math.random() * 20 : 85 + Math.random() * 10;
    setLatestMetrics({
      time: new Date().toLocaleTimeString(),
      frequency: 70e6,
      power: result.noiseFloor + 30,
      noise: result.noiseFloor,
      cnRatio: result.carriers.length > 0 ? result.carriers[0].cnRatio : 0,
      ebNo: result.carriers.length > 0 ? result.carriers[0].cnRatio * 0.7 : 0,
      signalHealth: avgHealth,
    });

    // Add log entries (throttled)
    if (frameCountRef.current % 5 === 0) {
      const d = new Date();
      const now = d.toLocaleTimeString('en-US', { hour12: false }) + '.' + Math.floor(d.getMilliseconds() / 100);
      const newLogs: LogEntry[] = [];

      for (let i = 0; i < result.carriers.length; i++) {
        const c = result.carriers[i];
        newLogs.push({
          time: now,
          message: `Carrier ${i + 1} [AUTH]  |  Freq: ${(c.centerFreq / 1e6).toFixed(3)} MHz  |  BW: ${(c.bandwidth / 1e3).toFixed(1)} kHz  |  Peak: ${c.peakPower.toFixed(1)} dB  |  C/N: ${c.cnRatio.toFixed(2)} dB`,
          color: ['#4ec9b0', '#6abf69', '#98e898', '#00ff7f', '#b2fab4'][i % 5],
          type: 'carrier',
        });
      }

      for (const intf of result.interferences) {
        newLogs.push({
          time: now,
          message: `  └─ INTERFERENCE [${intf.method.toUpperCase()}]  |  Center: ${(intf.peakFreq / 1e6).toFixed(4)} MHz  |  Strength: +${intf.strengthDb.toFixed(1)} dB  |  Range: ${(intf.startFreq / 1e6).toFixed(4)}-${(intf.endFreq / 1e6).toFixed(4)} MHz`,
          color: '#ff6b6b',
          type: 'interference',
        });
      }

      if (result.carriers.length === 0) {
        newLogs.push({
          time: now,
          message: `No carriers  |  Noise: ${result.noiseFloor.toFixed(1)} dB  |  Threshold: ${result.detectThreshold.toFixed(1)} dB`,
          color: '#808080',
          type: 'info',
        });
      }

      setLogs(prev => [...prev.slice(-200), ...newLogs]);
    }
  }, [sat, enableIntf, enableMaxHold, enableMinHold, smoothEnabled, smoothAlpha]);

  useEffect(() => {
    if (!piConnected) return;
    intervalRef.current = setInterval(processFrame, 100);
    return () => clearInterval(intervalRef.current);
  }, [piConnected, processFrame]);

  const handleResetHold = useCallback(() => {
    maxHoldRef.current = null;
    minHoldRef.current = null;
  }, []);

  if (!sat) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="glass-panel rounded-none border-x-0 border-t-0 sticky top-0 z-30">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setMonitoringSatellite(null)} className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Fleet
            </Button>
            <div className="h-6 w-px bg-border/30" />
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h1 className="font-bold text-sm">{sat.name}</h1>
                <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">{sat.band}</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground">INTERFERENCE DETECTION • COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono ${
              piConnected ? 'bg-success/10 text-success border border-success/30' : 'bg-warning/10 text-warning border border-warning/30'
            }`}>
              {piConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 animate-pulse" />}
              {piConnected ? `Pi Connected • ${sat.piIpAddress}` : 'Connecting to Pi...'}
            </div>
            {anomalyDetected && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 text-xs font-mono animate-pulse">
                ⚠ INTERFERENCE DETECTED
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => {
              const signalData: SignalData[] = latestMetrics ? [latestMetrics] : [];
              exportSignalData(signalData, sat.name);
            }} className="border-border/40 text-xs">
              <Download className="w-3 h-3 mr-1.5" /> Export XLSX
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Metrics */}
        <MetricsGrid data={latestMetrics} anomaly={anomalyDetected} connected={piConnected} />

        {/* Main content: Spectrum + Controls */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Spectrum Analyzer - takes most space */}
          <div className="xl:col-span-9" style={{ minHeight: 450 }}>
            <SpectrumAnalyzer
              data={detectionResult}
              enableMaxHold={enableMaxHold}
              enableMinHold={enableMinHold}
            />
          </div>

          {/* Controls sidebar */}
          <div className="xl:col-span-3 space-y-4">
            <SpectrumControls
              enableIntf={enableIntf}
              setEnableIntf={setEnableIntf}
              enableMaxHold={enableMaxHold}
              setEnableMaxHold={setEnableMaxHold}
              enableMinHold={enableMinHold}
              setEnableMinHold={setEnableMinHold}
              smoothEnabled={smoothEnabled}
              setSmoothEnabled={setSmoothEnabled}
              smoothAlpha={smoothAlpha}
              setSmoothAlpha={setSmoothAlpha}
              onResetHold={handleResetHold}
            />
          </div>
        </div>

        {/* Detection Log */}
        <div style={{ height: 280 }}>
          <DetectionLog logs={logs} onClear={() => setLogs([])} />
        </div>
      </div>
    </div>
  );
};
