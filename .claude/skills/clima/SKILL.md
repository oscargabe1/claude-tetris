---
name: clima
description: Clima y temperatura actual de una ciudad. Default Ciudad de México; acepta otra ciudad como argumento (/clima Madrid).
argument-hint: "[ciudad]"
---

# Clima

Ciudad = `$ARGUMENTS` si no está vacío; si no, `Mexico City`.

1. Reemplaza espacios por `+` en la ciudad.
2. WebFetch `https://wttr.in/<ciudad>?format=%l:+%C+%t+(sens.+%f)+hum:%h+viento:%w` con prompt "Return the raw text".
3. Responde en español, muy conciso, una línea: ciudad, condición, temperatura, sensación, humedad, viento.
4. Si falla o la ciudad no existe, dilo en una línea.
