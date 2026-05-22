attribute float size;
attribute vec3 color;
varying vec3 vColor;
varying float vTwinkle;
uniform float uScale;
uniform float uTime;

// Deterministic hash — unique phase per star from its position
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.9))) * 43758.5453);
}

void main() {
  vColor = color;
  // Each star gets its own slow, independent twinkling cycle
  float phase = hash(position) * 6.2832;              // unique offset 0..2π
  float speed = 0.2 + hash(position * 1.7) * 0.35;   // 0.2–0.55 rad/s (slow)
  vTwinkle = 0.78 + sin(uTime * speed + phase) * 0.22; // 0.56..1.0
  gl_PointSize = min(size * uScale * vTwinkle, 64.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
