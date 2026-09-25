import * as THREE from "three";

export type GardenStage = 0 | 1 | 2;
export type GardenScene = ReturnType<typeof createGardenScene>;
export function createGardenScene(
  canvas: HTMLCanvasElement,
  onApproach: () => void,
  onSelect: (index: number) => void,
  onHover: (index: number | null) => void,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let stage: GardenStage = 0,
    selected = -1,
    count = 0,
    animation = 0,
    last = 0,
    strikeAt = -1000,
    hovered = -1,
    disposed = false;
  const piano = new THREE.Group();
  scene.add(piano);
  piano.position.set(1.55, -0.55, 0);
  piano.rotation.y = -0.38;
  const ebony = new THREE.MeshPhysicalMaterial({
    color: 0x111814,
    metalness: 0.3,
    roughness: 0.23,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x211911, roughness: 0.6 }),
    gold = new THREE.MeshStandardMaterial({ color: 0xbda364, metalness: 0.78, roughness: 0.31 }),
    ivory = new THREE.MeshStandardMaterial({ color: 0xe7e1ca, roughness: 0.45 }),
    black = new THREE.MeshStandardMaterial({ color: 0x080c0b, roughness: 0.3 }),
    felt = new THREE.MeshStandardMaterial({ color: 0xc7b49d, roughness: 1 });
  function box(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = piano,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function rod(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    mat: THREE.Material,
    parent: THREE.Object3D = piano,
  ) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(m);
    return m;
  }
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.9);
  shape.lineTo(1, -0.9);
  shape.lineTo(1, 0.2);
  shape.bezierCurveTo(1, 1.0, 0.6, 1.95, -0.05, 2);
  shape.bezierCurveTo(-0.65, 2.05, -1, 1.65, -1, 1);
  shape.closePath();
  function body(depth: number, mat: THREE.Material, y: number, parent: THREE.Object3D = piano) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 3,
      steps: 1,
      curveSegments: 32,
    });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  body(0.2, ebony, 1.45);
  body(0.025, gold, 1.46);
  // Structural rim around the soundboard.
  const pts = shape.getPoints(70).map((p) => new THREE.Vector3(p.x, 1.51, -p.y));
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 100, 0.045, 8, true),
    ebony,
  );
  piano.add(rim);
  for (const [x, z] of [
    [-0.82, 0.62],
    [0.82, 0.62],
    [-0.05, -1.7],
  ] as const) {
    box(0.115, 1.23, 0.12, ebony, x, 0.65, z);
    box(0.14, 0.09, 0.15, gold, x, 0.075, z);
  }
  box(2.08, 0.17, 0.58, ebony, 0, 1.31, 1.14);
  box(2.12, 0.05, 0.64, ebony, 0, 1.23, 1.12);
  const keys: THREE.Mesh[] = [],
    hammers: THREE.Group[] = [];
  for (let i = 0; i < 28; i++) {
    const x = -0.96 + i * 0.071;
    keys.push(box(0.066, 0.055, 0.47, ivory, x, 1.415, 1.14));
    if (![2, 6].includes(i % 7)) box(0.039, 0.073, 0.27, black, x + 0.035, 1.46, 1.03);
    const h = new THREE.Group();
    h.position.set(x, 1.51, 0.55);
    box(0.035, 0.025, 0.33, wood, 0, 0, -0.15, h);
    box(0.054, 0.085, 0.12, felt, 0, 0.055, -0.3, h);
    piano.add(h);
    hammers.push(h);
  }
  for (let i = 0; i < 57; i++) {
    let x = -0.9 + i * 0.031;
    const end = -1.74 + Math.pow(x + 0.25, 2) * 0.66;
    rod(new THREE.Vector3(x, 1.51, 0.3), new THREE.Vector3(x * 0.6, 1.51, end), 0.0025, gold);
  }
  for (let i = 0; i < 3; i++)
    rod(
      new THREE.Vector3(-0.82 + i * 0.65, 1.55, 0.35),
      new THREE.Vector3(-0.4 + i * 0.4, 1.55, -1.45),
      0.023,
      gold,
    );
  box(0.42, 0.05, 0.25, gold, 0, 0.19, 0.81);
  rod(new THREE.Vector3(0, 0.25, 0.8), new THREE.Vector3(0, 1.22, 0.62), 0.022, gold);
  const lid = new THREE.Group();
  lid.position.set(-1, 1.58, 0);
  piano.add(lid);
  const lidMesh = body(0.065, ebony, 0, lid);
  lidMesh.position.x = 1;
  const stand = new THREE.Group();
  stand.position.set(0, 1.52, 0.52);
  piano.add(stand);
  box(1.12, 0.54, 0.035, ebony, 0, 0.27, 0, stand);
  box(1.16, 0.04, 0.1, gold, 0, 0, 0.04, stand);
  stand.rotation.x = -Math.PI / 2;
  const bench = new THREE.Group();
  piano.add(bench);
  box(0.8, 0.14, 0.39, ebony, 0, 0.78, 1.95, bench);
  for (const x of [-0.32, 0.32])
    for (const z of [1.82, 2.08]) box(0.055, 0.69, 0.055, ebony, x, 0.36, z, bench);
  const ambientLight = new THREE.HemisphereLight(0xd8e7c4, 0x293429, 3);
  scene.add(ambientLight);
  const sun = new THREE.DirectionalLight(0xffe5ae, 5);
  sun.position.set(3, 8, 4);
  scene.add(sun);
  const edge = new THREE.DirectionalLight(0xb9d9ce, 2);
  edge.position.set(-3, 4, -4);
  scene.add(edge);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShadowMaterial({ opacity: 0.3 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.55;
  floor.receiveShadow = true;
  scene.add(floor);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const particles = new Float32Array(160 * 3);
  for (let i = 0; i < particles.length; i += 3) {
    particles[i] = (Math.random() - 0.5) * 15;
    particles[i + 1] = Math.random() * 7;
    particles[i + 2] = (Math.random() - 0.5) * 9;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(particles, 3));
  const dust = new THREE.Points(
    pg,
    new THREE.PointsMaterial({
      color: 0xd7cca3,
      size: 0.018,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  scene.add(dust);

  const views = [
    { p: [5, 3.1, 9], t: [0, 1, 0] },
    { p: [4.6, 4.1, 5.1], t: [0.55, 0.85, 0] },
    { p: [3.4, 5, 3.4], t: [0.75, 1, 0] },
  ];
  const pos = new THREE.Vector3(5, 3.1, 9),
    target = new THREE.Vector3(0, 1, 0),
    pointer = new THREE.Vector2(),
    ray = new THREE.Raycaster();
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  function frame(now: number) {
    if (disposed) return;
    animation = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const view = views[stage]!;
    const factor = reduced.matches ? 1 : 1 - Math.exp(-dt * 1.8);
    pos.lerp(new THREE.Vector3(...view.p), factor);
    target.lerp(new THREE.Vector3(...view.t), factor);
    camera.position.copy(pos);
    if (stage === 0 && !reduced.matches) {
      camera.position.x += pointer.x * 0.09;
      camera.position.y += pointer.y * 0.06;
    }
    camera.lookAt(target);
    lid.rotation.z = THREE.MathUtils.lerp(lid.rotation.z, stage > 0 ? 0.78 : 0, factor);
    stand.rotation.x = THREE.MathUtils.lerp(
      stand.rotation.x,
      stage > 0 ? -0.18 : -Math.PI / 2,
      factor,
    );
    if (!reduced.matches) dust.rotation.y = now * 0.000012;
    hammers.forEach((hammer, i) => {
      const active = stage === 2 && selected >= 0 && i === selected;
      const strike = active && now - strikeAt < 240;
      hammer.rotation.x = THREE.MathUtils.lerp(
        hammer.rotation.x,
        strike ? 0.55 : active ? -0.24 + (reduced.matches ? 0 : Math.sin(now * 0.013) * 0.025) : 0,
        0.22,
      );
      keys[i]!.position.y = THREE.MathUtils.lerp(keys[i]!.position.y, active ? 1.398 : 1.415, 0.15);
    });
    (ebony as THREE.MeshPhysicalMaterial).emissive.setHex(
      stage === 0 && hovered === -2 ? 0x152616 : 0,
    );
    renderer.render(scene, camera);
  }
  animation = requestAnimationFrame(frame);
  function hit(event: PointerEvent | MouseEvent) {
    const r = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      (-(event.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    if (stage === 0) return ray.intersectObject(piano, true).length ? -2 : -1;
    if (stage !== 2) return -1;
    const found = ray.intersectObjects(hammers, true)[0];
    const index = found ? hammers.indexOf(found.object.parent as THREE.Group) : -1;
    return index < count ? index : -1;
  }
  function move(event: PointerEvent) {
    const index = hit(event);
    if (index === hovered) return;
    hovered = index;
    canvas.style.cursor = index !== -1 ? "pointer" : "default";
    onHover(index >= 0 ? index : null);
    if (index >= 0) selected = index;
  }
  function leave() {
    hovered = -1;
    onHover(null);
    canvas.style.cursor = "default";
  }
  function click(event: MouseEvent) {
    const index = hit(event);
    if (index === -2) onApproach();
    else if (index >= 0) onSelect(index);
  }
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("click", click);
  return {
    setStage(value: GardenStage) {
      stage = value;
      hovered = -1;
      onHover(null);
    },
    setPieces(value: number) {
      count = Math.min(value, hammers.length);
    },
    select(index: number) {
      selected = index;
    },
    strike() {
      strikeAt = performance.now();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("click", click);
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const mat = object.material;
          if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
          else materials.add(mat);
        }
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    },
  };
}
