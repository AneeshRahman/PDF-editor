import { Moon, Sun } from "lucide-react";
import { Switch } from "./ui/switch";
import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";

/** Sun · switch · moon. A real on/off switch for dark mode. */
export const ThemeSwitch = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <label className={cn("flex cursor-pointer select-none items-center gap-2", className)}>
      <Sun className={cn("h-4 w-4 transition-colors", dark ? "text-muted-foreground" : "text-foreground")} aria-hidden="true" />
      <Switch
        checked={dark}
        onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
        aria-label="Dark theme"
        className="h-5 w-9 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-input [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
      />
      <Moon className={cn("h-4 w-4 transition-colors", dark ? "text-foreground" : "text-muted-foreground")} aria-hidden="true" />
    </label>
  );
};
