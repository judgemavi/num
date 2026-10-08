import { useEffect, useState } from "react";

const phoneQuery = "(max-width: 767px)";

export function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches);

  useEffect(() => {
    const media = window.matchMedia(phoneQuery);
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return phone;
}
