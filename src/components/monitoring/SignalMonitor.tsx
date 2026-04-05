import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Download, Wifi, WifiOff, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/appStore';
import { SignalData } from '@/types/satellite';
import { SpectrumChart } from './SpectrumChart';
import { MetricsGrid } from './MetricsGrid';
import { RadarView } from './RadarView';
import { exportSignalData } from '@/lib/exportData';

export const SignalMonitor = () => {
  const { monitoringSatellite: sat, setMonitoringSatellite } = useAppStore();
  const [signalData, setSignalData] = useState<SignalData[]>([]);
  const [piConnected, setPiConnected] = useState(false);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const generateSignalPoint = useCallback((): SignalData => {
    const base = sat!;
    const noise = (Math.random() - 0.5) * 6;
    const anomaly = Math.random() > 0.92;
    return {
      time: new Date().toLocaleTimeString(),
      frequency: 3700 + Math.random() * 600,
      power: -30 + noise + (anomaly ? -20 : 0),
      noise: -60 + (Math.random() - 0.5) * 4,
      cnRatio: base.cnRatio + (Math.random() - 0.5) * 3 + (anomaly ? -8 : 0),
      ebNo: base.ebNo + (Math.random() - 0.5) * 2,
      signalHealth: Math.max(0, Math.min(100, base.signalHealth + (Math.random() - 0.5) * 8 + (anomaly ? -15 : 0))),
    };
  }, [sat]);

  useEffect(() => {
    // Simulate Pi connection
    const t = setTimeout(() => setPiConnected(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!piConnected) return;
    intervalRef.current = setInterval(() => {
      setSignalData(prev => {
        const point = generateSignalPoint();
        if (point.signalHealth < 60) setAnomalyDetected(true);
        else setAnomalyDetected(false);
        const next = [...prev, point];
        return next.slice(-60);
      });
    }, 800);
    return () => clearInterval(intervalRef.current);
  }, [piConnected, generateSignalPoint]);

  if (!sat) return null;
  const latest = signalData[signalData.length - 1];

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
              <p className="text-[10px] font-mono text-muted-foreground">SIGNAL MONITORING • COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Pi Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono ${
              piConnected ? 'bg-success/10 text-success border border-success/30' : 'bg-warning/10 text-warning border border-warning/30'
            }`}>
              {piConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 animate-pulse" />}
              {piConnected ? `Pi Connected • ${sat.piIpAddress}` : 'Connecting to Pi...'}
            </div>
            {anomalyDetected && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 text-xs font-mono animate-pulse">
                ⚠ ANOMALY
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => exportSignalData(signalData, sat.name)}
              className="border-border/40 text-xs">
              <Download className="w-3 h-3 mr-1.5" /> Export XLSX
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metrics */}
        <MetricsGrid data={latest} anomaly={anomalyDetected} connected={piConnected} />

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <SpectrumChart data={signalData} />
          </div>
          <div>
            <RadarView data={signalData} anomaly={anomalyDetected} />
          </div>
        </div>
      </div>
    </div>
  );
};
