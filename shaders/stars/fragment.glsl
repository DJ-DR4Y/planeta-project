varying vec3 vColor;
uniform float uOpacity;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float alpha = uOpacity * (1.0 - smoothstep(0.2, 0.5, dist));
  gl_FragColor = vec4(vColor, alpha);
}
