# Mandala AR

Ejemplo de un mandala para colorear que, terminado, funciona de dos formas:

1. **Es un código QR** que abre esta página.
2. **Es la imagen que reconoce la realidad aumentada**: al apuntarle con la cámara, el video aparece dentro del círculo central.

Página: https://elbuendieg0.github.io/mandala-ar/

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página AR (A-Frame + MindAR) |
| `mandala-para-colorear.png` | Hoja para imprimir y colorear por números |
| `mandala-terminado.png` | Cómo queda pintado; es también la imagen objetivo |
| `targets.mind` | La imagen objetivo compilada para MindAR |
| `video.mp4` | Video de muestra que aparece sobre el mandala |

## Cambiar el video

Reemplaza `video.mp4` por tu video (MP4, H.264, idealmente cuadrado y de menos de 20 MB) y sube el cambio.

## Cambiar el mandala

Si la imagen objetivo cambia (otro diseño, o un mandala pintado con otros colores):

1. Toma una foto de frente o exporta la imagen.
2. Compílala en https://hiukim.github.io/mind-ar-js-doc/tools/compile y descarga el `targets.mind`.
3. Reemplaza `targets.mind` y `mandala-terminado.png`.

El reconocimiento compara contra esa imagen, así que funciona mejor cuando el mandala está pintado con la misma clave de colores.
