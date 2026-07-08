import { Cloud } from "lucide-react";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="bg-primary flex size-9 items-center justify-center rounded-[10px]">
        <Cloud className="size-5 text-white" />
      </div>
      <span className="text-[19px] font-bold tracking-tight">Vault</span>
    </div>
  );
}
