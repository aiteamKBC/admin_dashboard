import { useEffect, useState } from "react";
export default function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined")
            return false;
        return window.matchMedia(query).matches;
    });
    useEffect(() => {
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);
        onChange();
        if (mq.addEventListener)
            mq.addEventListener("change", onChange);
        else
            mq.addListener(onChange);
        return () => {
            if (mq.removeEventListener)
                mq.removeEventListener("change", onChange);
            else
                mq.removeListener(onChange);
        };
    }, [query]);
    return matches;
}
