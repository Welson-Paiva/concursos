import React from 'react';

export const PATENTES = [
  { nivel: 1, nome: "Recruta", minXp: 0, cor: "#94a3b8", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L4 7V17L12 22L20 17V7L12 2Z"/></svg> },
  { nivel: 2, nome: "Soldado", minXp: 500, cor: "#4ade80", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M7 4L12 9L17 4M7 9L12 14L17 9"/></svg> },
  { nivel: 3, nome: "Cabo", minXp: 1500, cor: "#60a5fa", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M7 4L12 9L17 4M7 9L12 14L17 9M7 14L12 19L17 14"/></svg> },
  { nivel: 4, nome: "Sargento", minXp: 5000, cor: "#c084fc", svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 7V12C3 17.5 7 21 12 22C17 21 21 17.5 21 12V7L12 2Z" fill="currentColor" fillOpacity="0.2"/><path d="M8 10L12 13L16 10M8 14L12 17L16 14"/></svg> },
  { nivel: 5, nome: "Tenente", minXp: 15000, cor: "#fbbf24", svg: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 8.5H22L16.5 13L18.5 20L12 16L5.5 20L7.5 13L2 8.5H9L12 2Z"/></svg> },
];

export const getPatente = (xp) => [...PATENTES].reverse().find(p => xp >= p.minXp) || PATENTES[0];