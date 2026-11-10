// Le pone esqueleto a un modelo sin rig (en pose A) y lo hace bailar.
// Las articulaciones están medidas sobre la imagen de referencia (1105×1536 px)
// y se convierten a coordenadas del modelo, que mide 1 de alto con el centro en 0.
(function () {
  const PX = 1415.25, CX = 573, TY = 786.4;
  const J = {
    pelvis: [573, 830], spine: [573, 680], chest: [573, 470], neck: [573, 325], head: [573, 290], top: [573, 79],
    shL: [405, 380], elL: [235, 590], wrL: [130, 735], fiL: [85, 790],
    shR: [742, 380], elR: [912, 590], wrR: [1015, 735], fiR: [1062, 790],
    hipL: [515, 850], knL: [500, 1160], anL: [480, 1440], toL: [470, 1490],
    hipR: [632, 850], knR: [648, 1160], anR: [668, 1440], toR: [678, 1490],
  };
  // hueso: [padre, segmentos que mueve como [articulación, articulación, grosor], lado (-1 izq, 1 der, 0 centro)]
  // El grosor evita que la piel del torso se pegue a un brazo cercano: se mide la distancia a la superficie, no al eje.
  const BONES = {
    pelvis: [null, [['pelvis', 'spine', 0.09], ['pelvis', 'hipL', 0.07], ['pelvis', 'hipR', 0.07]], 0],
    spine: ['pelvis', [['spine', 'chest', 0.1]], 0],
    chest: ['spine', [['chest', 'neck', 0.1], ['chest', 'shL', 0.06], ['chest', 'shR', 0.06]], 0],
    neck: ['chest', [['neck', 'head', 0.045]], 0],
    head: ['neck', [['head', 'top', 0.08]], 0],
    shL: ['chest', [['shL', 'elL', 0.04]], -1], elL: ['shL', [['elL', 'wrL', 0.033]], -1], wrL: ['elL', [['wrL', 'fiL', 0.025]], -1],
    shR: ['chest', [['shR', 'elR', 0.04]], 1], elR: ['shR', [['elR', 'wrR', 0.033]], 1], wrR: ['elR', [['wrR', 'fiR', 0.025]], 1],
    hipL: ['pelvis', [['hipL', 'knL', 0.065]], -1], knL: ['hipL', [['knL', 'anL', 0.05]], -1], anL: ['knL', [['anL', 'toL', 0.04]], -1],
    hipR: ['pelvis', [['hipR', 'knR', 0.065]], 1], knR: ['hipR', [['knR', 'anR', 0.05]], 1], anR: ['knR', [['anR', 'toR', 0.04]], 1],
  };
  const ARM = new Set(['shL', 'elL', 'wrL', 'shR', 'elR', 'wrR']);

  function segDist(p, a, b) {
    const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  }

  AFRAME.registerComponent('bailar', {
    schema: { activo: { default: false }, bpm: { default: 112 } },

    init() {
      this.bones = null;
      this.el.addEventListener('model-loaded', () => this.rig());
    },

    rig() {
      const root = this.el.getObject3D('mesh');
      const meshes = [];
      root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
      if (!meshes.length) return;

      // Lleva cada malla directamente bajo la raíz, con su transformación aplicada a la geometría
      for (const m of meshes) {
        const mat = new THREE.Matrix4();
        for (let o = m; o && o !== root; o = o.parent) { o.updateMatrix(); mat.premultiply(o.matrix); }
        m.geometry = m.geometry.clone();
        m.geometry.applyMatrix4(mat);
      }

      // Posición 3D de cada articulación: x, y de la imagen; z = profundidad media del cuerpo en ese punto
      const pos = {};
      const all = meshes.map(m => m.geometry.attributes.position);
      for (const [k, [px, py]] of Object.entries(J)) {
        const x = (px - CX) / PX, y = (TY - py) / PX;
        let zs = 0, n = 0;
        for (const a of all) for (let i = 0; i < a.count; i += 3) {
          if (Math.hypot(a.getX(i) - x, a.getY(i) - y) < 0.025) { zs += a.getZ(i); n++; }
        }
        pos[k] = new THREE.Vector3(x, y, n ? zs / n : 0);
      }

      const names = Object.keys(BONES);
      const bones = {}, list = [], inverses = [];
      for (const k of names) {
        const b = new THREE.Bone(); b.name = k;
        const parent = BONES[k][0];
        b.position.copy(pos[k]);
        if (parent) b.position.sub(pos[parent]);
        bones[k] = b; list.push(b);
        inverses.push(new THREE.Matrix4().makeTranslation(-pos[k].x, -pos[k].y, -pos[k].z));
      }
      for (const k of names) if (BONES[k][0]) bones[BONES[k][0]].add(bones[k]);
      const skeleton = new THREE.Skeleton(list, inverses);
      root.add(bones.pelvis);

      // Pesos: cada vértice sigue a los huesos más cercanos (hasta 4), con transición suave en las articulaciones
      const segs = names.map(k => BONES[k][1].map(([a, b, r]) => [pos[a], pos[b], r]));
      for (const m of meshes) {
        const a = m.geometry.attributes.position, n = a.count;
        const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
        const p = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          p.fromBufferAttribute(a, i);
          const cand = [];
          names.forEach((k, bi) => {
            const side = BONES[k][2];
            if (side && side * p.x < -0.01) return;
            if (ARM.has(k) && Math.abs(p.x) < 0.1) return;
            let d = Infinity;
            for (const [s0, s1, r] of segs[bi]) d = Math.min(d, Math.max(segDist(p, s0, s1) - r, 0));
            cand.push([bi, 1 / Math.pow(d + 0.006, 4)]);
          });
          cand.sort((u, v) => v[1] - u[1]);
          const top = cand.slice(0, 4), sum = top.reduce((s, c) => s + c[1], 0);
          top.forEach(([bi, w], j) => { idx[i * 4 + j] = bi; wts[i * 4 + j] = w / sum; });
        }
        m.geometry.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
        m.geometry.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));

        const sk = new THREE.SkinnedMesh(m.geometry, m.material);
        sk.frustumCulled = false;
        sk.bind(skeleton, new THREE.Matrix4());
        m.parent.remove(m);
        root.add(sk);
      }

      // Largo de pierna, para bajar la cadera cuando se doblan las rodillas
      this.thigh = pos.hipL.distanceTo(pos.knL);
      this.shin = pos.knL.distanceTo(pos.anL);
      this.pelvisY = bones.pelvis.position.y;
      this.bones = bones;
    },

    tick(time) {
      const B = this.bones;
      if (!B) return;
      for (const b of Object.values(B)) b.rotation.set(0, 0, 0);
      B.pelvis.position.y = this.pelvisY;
      if (!this.data.activo) return;

      const beat = time / 1000 * this.data.bpm / 60 * Math.PI * 2;   // una vuelta por tiempo
      const dip = 0.5 - 0.5 * Math.cos(beat);                         // rebote en cada tiempo
      const sway = Math.sin(beat / 2);                                // balanceo cada dos tiempos
      const up = 0.5 + 0.5 * Math.sin(beat / 2);                      // brazos que se alternan

      // Piernas: rebote doblando rodillas, con los pies en el piso
      const k = 0.28 * dip;
      for (const s of ['L', 'R']) {
        B['hip' + s].rotation.x = -k;
        B['kn' + s].rotation.x = 2 * k;
        B['an' + s].rotation.x = -k;
      }
      B.pelvis.position.y = this.pelvisY - (this.thigh + this.shin) * (1 - Math.cos(k));

      // Cadera y torso
      B.pelvis.rotation.y = 0.22 * sway;
      B.pelvis.rotation.z = 0.05 * sway;
      B.spine.rotation.z = -0.07 * sway;
      B.chest.rotation.y = -0.18 * sway;
      B.chest.rotation.x = 0.06 * dip;

      // Brazos: uno arriba y el otro abajo, alternando, con los codos doblados
      B.shL.rotation.z = -1.5 * up + 0.3 * (1 - up);
      B.shR.rotation.z = 1.5 * (1 - up) - 0.3 * up;
      B.shL.rotation.x = -0.3 * dip;
      B.shR.rotation.x = -0.3 * dip;
      B.elL.rotation.z = -0.9 * up - 0.15;
      B.elR.rotation.z = 0.9 * (1 - up) + 0.15;
      B.wrL.rotation.z = -0.3 * sway;
      B.wrR.rotation.z = -0.3 * sway;

      // Cabeza al ritmo
      B.neck.rotation.x = 0.1 * Math.sin(beat);
      B.head.rotation.z = 0.12 * sway;
    },
  });
})();
