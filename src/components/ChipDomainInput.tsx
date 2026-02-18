import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/;

interface Props {
  domains: string[];
  onChange: (domains: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChipDomainInput({ domains, onChange, placeholder = "domain.de", disabled }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const addDomain = () => {
    const val = input.trim().toLowerCase();
    if (!val) return;
    if (!DOMAIN_REGEX.test(val)) {
      setError("Ungültiges Domain-Format");
      return;
    }
    if (domains.includes(val)) {
      setError("Domain bereits vorhanden");
      return;
    }
    onChange([...domains, val]);
    setInput("");
    setError("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain();
    }
  };

  const removeDomain = (domain: string) => {
    onChange(domains.filter((d) => d !== domain));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 border border-border rounded-md min-h-[42px]">
        {domains.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary border border-primary/20">
            {d}
            {!disabled && (
              <button onClick={() => removeDomain(d)} className="hover:text-foreground transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            onBlur={addDomain}
            placeholder={domains.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
