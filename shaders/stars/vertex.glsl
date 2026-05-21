attribute float size;
attribute vec3 color;
varying vec3 vColor;
uniform float uScale;

void main() {
  vColor = color;
  gl_PointSize = min(size * uScale, 64.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
