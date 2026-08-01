"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Nền WebGL tối giản: một lớp hạt thưa, mờ, trôi rất chậm + parallax nhẹ
 * theo chuột. Chủ đích là tạo chiều sâu tinh tế — KHÔNG hút sự chú ý khỏi
 * card chức năng ở trung tâm.
 *
 * Hiệu năng: pixel ratio giới hạn 2, tạm dừng khi tab ẩn,
 * dọn tài nguyên đầy đủ khi unmount.
 */
export default function Background() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0d0e12, 0.06);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.z = 9;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // ---- Trường hạt thưa, mờ ----
    const COUNT = 320;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const palette = [
      new THREE.Color(0xff007a), // hồng
      new THREE.Color(0xb478ff), // tím
      new THREE.Color(0x4c82fb), // xanh
      new THREE.Color(0x8a8f9b), // xám nhạt
    ];
    for (let i = 0; i < COUNT; i++) {
      const r = 7 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = r * Math.cos(phi) - 5;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ---- Tương tác chuột (parallax rất nhẹ) ----
    const mouse = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ---- Vòng lặp render ----
    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();
    const animate = () => {
      if (!running) return;
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      points.rotation.y = t * 0.008;
      points.rotation.x = Math.sin(t * 0.03) * 0.03;

      target.x += (mouse.x * 0.25 - target.x) * 0.02;
      target.y += (mouse.y * 0.15 - target.y) * 0.02;
      camera.position.x = target.x;
      camera.position.y = -target.y;
      camera.lookAt(0, 0, -2);

      renderer.render(scene, camera);
    };
    animate();

    // Tạm dừng khi tab ẩn để tiết kiệm pin/CPU.
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) {
        clock.start();
        animate();
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden
    />
  );
}
