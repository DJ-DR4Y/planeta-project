varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPos;

void main() {
  // Use normalize(position) instead of geometry normal:
  // IcosahedronGeometry has flat per-face normals (non-indexed mesh).
  // Computing the normal radially from position gives a perfectly smooth
  // spherical normal, eliminating visible triangle-edge shading lines.
  vNormal    = normalize(normalMatrix * normalize(position));
  vPosition  = position;
  vec4 wPos  = modelMatrix * vec4(position, 1.0);
  vWorldPos  = wPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
