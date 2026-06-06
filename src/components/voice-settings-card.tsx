import { Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useVoiceSettings } from "@/lib/voice/voice-settings";
import { speak } from "@/lib/voice/voice-engine";

export function VoiceSettingsCard() {
  const [s, set] = useVoiceSettings();
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium flex items-center gap-2">
            {s.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            Voice guidance
          </div>
          <p className="text-xs text-muted-foreground">
            Spoken turn-by-turn directions and hazard alerts while navigating.
          </p>
        </div>
        <Switch checked={!s.muted} onCheckedChange={(v) => set({ muted: !v })} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Volume</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{Math.round(s.volume * 100)}%</span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[s.volume]}
          onValueChange={([v]) => set({ volume: v })}
          disabled={s.muted}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Speaking rate</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{s.rate.toFixed(1)}×</span>
        </div>
        <Slider
          min={0.7}
          max={1.6}
          step={0.1}
          value={[s.rate]}
          onValueChange={([v]) => set({ rate: v })}
          disabled={s.muted}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Voice hazard alerts</Label>
          <p className="text-xs text-muted-foreground">Read high winds, closures, and severe weather aloud.</p>
        </div>
        <Switch
          checked={s.hazardAlerts}
          onCheckedChange={(v) => set({ hazardAlerts: v })}
          disabled={s.muted}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => speak("Voice guidance test. In 1 mile, turn left onto Main Street.", { priority: "high", dedupeKey: `test:${Date.now()}` })}
        disabled={s.muted}
      >
        Test voice
      </Button>

      <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
        Voice continues while you view the Hazard Map. On iPhone, voice may pause when the screen locks —
        background voice will work in the upcoming native app.
      </p>
    </div>
  );
}
