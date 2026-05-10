import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getRestaurants, addRestaurant, addDish, deleteDish, uploadPhoto,
} from '../lib/supabase';

// ── Constants ──────────────────────────────────────────────
const RATING_LABELS = {
  1:'Meh', 2:'Regular', 3:'Ok', 4:'Bien', 5:'Bueno',
  6:'Muy bueno', 7:'Rico', 8:'Muy rico', 9:'Excepcional', 10:'¡Sublime!',
};
const PALETTE = ['#C2691A','#2D6A4F','#6B2D8B','#2D5FA8','#A8642D','#1A6B6B','#8B1A1A','#4A6B1A'];
const EMOJIS  = ['🍽️','🌴','🎋','🌿','🔥','🐟','🥩','🍜','🌮','🍣','🥂','🏖️','🦐','🧆','🥗'];

const ratingColor = r => r >= 9 ? '#FFD700' : r >= 7 ? '#FF6B35' : r >= 5 ? '#4ECDC4' : '#888';

// ── Helpers ────────────────────────────────────────────────
async function getCurrentRestaurant(setRestoName, setCoords, setGeoLoading) {
  if (!navigator.geolocation) return;
  setGeoLoading(true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'es' } }
        );
        const d = await res.json();
        const place = d.namedetails?.name || d.display_name?.split(',')[0] || '';
        if (place) setRestoName(place);
      } catch (_) {}
      setGeoLoading(false);
    },
    () => setGeoLoading(false),
    { timeout: 8000 }
  );
}

async function identifyDish(file, setDishName, setAiLoading) {
  setAiLoading(true);
  try {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      const res = await fetch('/api/identify-dish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type }),
      });
      const d = await res.json();
      if (d.name) setDishName(d.name);
    };
    reader.readAsDataURL(file);
  } catch (_) {}
  finally { setAiLoading(false); }
}

function shareRestaurant(restaurant) {
  const top = [...restaurant.dishes]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);
  const text =
    `🍽️ Nuestros favoritos en ${restaurant.name}:\n\n` +
    top.map((d, i) =>
      `${i + 1}. ${d.name} — ${d.rating}/10 (${RATING_LABELS[d.rating]})` +
      (d.notes ? `\n   💬 ${d.notes}` : '')
    ).join('\n\n') +
    '\n\nGuardado con FoodLog';
  if (navigator.share) {
    navigator.share({ title: `Favoritos ${restaurant.name}`, text });
  } else {
    navigator.clipboard.writeText(text);
    alert('¡Copiado! Pégalo en WhatsApp');
  }
}

// ── Sub-components ─────────────────────────────────────────

const RatingBar = ({ value, onChange }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#888', fontFamily: "'DM Sans',sans-serif" }}>Calificación</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#FF6B35', fontFamily: "'DM Mono',monospace" }}>
        {value}/10 — {RATING_LABELS[value]}
      </span>
    </div>
    <input type="range" min={1} max={10} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: '100%', height: 6, borderRadius: 3, cursor: 'pointer',
        background: `linear-gradient(to right,#FF6B35 ${(value-1)/9*100}%,#2a2a2a ${(value-1)/9*100}%)`,
      }}
    />
  </div>
);

const Badge = ({ rating, small }) => (
  <span style={{
    background: ratingColor(rating), color: '#000', fontWeight: 900,
    fontSize: small ? 10 : 12, padding: small ? '1px 6px' : '3px 9px',
    borderRadius: 20, fontFamily: "'DM Mono',monospace", letterSpacing: 0.5,
    display: 'inline-block', flexShrink: 0,
  }}>
    {rating}/10
  </span>
);

// ── Dish detail modal (foto grande + acciones) ─────────────
const DishDetailModal = ({ dish, onClose, onEdit, onDelete }) => {
  const [confirm, setConfirm] = useState(false);
  if (!dish) return null;
  return (
    <div className="overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
    }}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{
        background: '#0e0e0e', borderRadius: '24px 24px 0 0', width: '100%',
        maxWidth: 480, border: '1px solid #2a2a2a', borderBottom: 'none', overflow: 'hidden',
      }}>
        {/* Foto grande */}
        {dish.photo_url ? (
          <div style={{ width: '100%', height: 280, position: 'relative' }}>
            <img src={dish.photo_url} alt={dish.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.85))',
            }} />
            <button onClick={onClose} style={{
              position: 'absolute', top: 14, right: 14, width: 34, height: 34,
              borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>×</button>
          </div>
        ) : (
          <div style={{
            width: '100%', height: 140, background: '#1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
          }}>🍽️</div>
        )}

        {/* Info */}
        <div style={{ padding: '20px 22px 36px' }}>
          <div style={{ fontSize: 22, fontFamily: "'DM Serif Display',serif", color: '#f0f0f0', marginBottom: 10 }}>
            {dish.name}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <Badge rating={dish.rating} />
            <span style={{ fontSize: 12, color: '#555', fontFamily: "'DM Mono',monospace" }}>
              {RATING_LABELS[dish.rating]}
            </span>
          </div>
          {dish.notes && (
            <div style={{ fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 10,
              padding: '10px 14px', background: '#1a1a1a', borderRadius: 10 }}>
              💬 {dish.notes}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#444', fontFamily: "'DM Mono',monospace", marginBottom: 20 }}>
            {dish.added_by} · {new Date(dish.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'2-digit' })}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!confirm ? (
              <>
                <button onClick={() => setConfirm(true)} style={{
                  flex: 1, padding: 13, borderRadius: 12, border: '1px solid #8B1A1A',
                  background: 'transparent', color: '#8B1A1A', fontSize: 14, cursor: 'pointer',
                }}>Borrar</button>
                <button onClick={() => { onClose(); onEdit(dish); }} style={{
                  flex: 1, padding: 13, borderRadius: 12, border: '1px solid #444',
                  background: '#1a1a1a', color: '#f0f0f0', fontSize: 14, cursor: 'pointer',
                }}>✏️ Editar</button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirm(false)} style={{
                  flex: 1, padding: 13, borderRadius: 12, border: '1px solid #333',
                  background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
                }}>Cancelar</button>
                <button onClick={() => { onDelete(dish.id); onClose(); }} style={{
                  flex: 1, padding: 13, borderRadius: 12, border: 'none',
                  background: '#8B1A1A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>Confirmar borrar</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Edit dish sheet ────────────────────────────────────────
const EditDishSheet = ({ dish, onSave, onClose }) => {
  const [dishName, setDishName] = useState(dish.name);
  const [rating, setRating]     = useState(dish.rating);
  const [notes, setNotes]       = useState(dish.notes || '');
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(dish.photo_url || null);
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef();

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!dishName.trim() || saving) return;
    setSaving(true);
    try {
      let photo_url = dish.photo_url;
      if (photoFile) photo_url = await uploadPhoto(photoFile);

      const { error } = await (await import('../lib/supabase')).supabase
        .from('dishes')
        .update({ name: dishName.trim(), rating, notes: notes.trim(), photo_url })
        .eq('id', dish.id);
      if (error) throw error;
      onSave();
    } catch (err) {
      console.error(err);
      alert('Error guardando. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 10, padding: '12px 14px', color: '#f0f0f0', fontSize: 15, outline: 'none',
  };

  return (
    <div className="overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 400,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div className="sheet" style={{
        background: '#0e0e0e', borderRadius: '24px 24px 0 0', width: '100%',
        maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid #2a2a2a', borderBottom: 'none',
      }}>
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, background: '#333', borderRadius: 2 }} />
        </div>
        <div style={{ padding: '18px 22px 42px' }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 20 }}>
            Editar platillo ✏️
          </div>

          {/* Foto */}
          <div onClick={() => fileRef.current.click()} style={{
            width: '100%', height: 160, borderRadius: 14, marginBottom: 14, cursor: 'pointer',
            background: photoPreview ? `url(${photoPreview}) center/cover` : '#1a1a1a',
            border: '2px dashed #333', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {!photoPreview && <><span style={{ fontSize: 32 }}>📸</span><span style={{ fontSize: 12, color: '#666' }}>Cambiar foto</span></>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
          </div>

          <input style={{ ...inp, marginBottom: 12 }} value={dishName}
            onChange={e => setDishName(e.target.value)} placeholder="Nombre del platillo" />

          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
            padding: '14px 16px', marginBottom: 12 }}>
            <RatingBar value={rating} onChange={setRating} />
          </div>

          <textarea style={{ ...inp, height: 72 }} value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notas: sin picante, solo fines de semana…" />

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: 14, borderRadius: 12, border: '1px solid #333',
              background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={handleSave} disabled={!dishName.trim() || saving} style={{
              flex: 2, padding: 14, borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700,
              background: dishName.trim() && !saving ? '#FF6B35' : '#2a2a2a',
              color: dishName.trim() && !saving ? '#fff' : '#555', cursor: 'pointer',
            }}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DishRow = ({ dish, onSelect }) => {
  return (
    <div onClick={() => onSelect(dish)} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderBottom: '1px solid #1e1e1e', cursor: 'pointer',
    }}>
      {dish.photo_url ? (
        <img src={dish.photo_url} alt={dish.name}
          style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 52, height: 52, borderRadius: 10, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          🍽️
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontFamily: "'DM Serif Display',serif", color: '#f0f0f0', marginBottom: 3 }}>
          {dish.name}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge rating={dish.rating} small />
          <span style={{ fontSize: 10, color: '#555', fontFamily: "'DM Mono',monospace" }}>
            {dish.added_by} · {new Date(dish.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'2-digit' })}
          </span>
        </div>
        {dish.notes && (
          <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            💬 {dish.notes}
          </div>
        )}
      </div>
      <span style={{ fontSize: 16, color: '#333', flexShrink: 0 }}>›</span>
    </div>
  );
};

const RestaurantCard = ({ restaurant, onClick }) => {
  const sorted = [...(restaurant.dishes || [])].sort((a,b) => b.rating - a.rating);
  const best = sorted[0];
  const avg = sorted.length
    ? (sorted.reduce((s,d) => s + d.rating, 0) / sorted.length).toFixed(1)
    : '—';

  return (
    <div onClick={onClick} style={{
      background: '#111', border: '1px solid #222', borderRadius: 20,
      overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s, transform 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor='#FF6B35'; e.currentTarget.style.transform='translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='#222'; e.currentTarget.style.transform='translateY(0)'; }}
    >
      <div style={{
        height: 78, padding: '0 20px',
        background: `linear-gradient(135deg, ${restaurant.color}cc 0%, ${restaurant.color}33 100%)`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>
          {restaurant.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontFamily: "'DM Serif Display',serif", color: '#fff', fontWeight: 700 }}>
            {restaurant.name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono',monospace" }}>
            {sorted.length} platillo{sorted.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: "'DM Mono',monospace" }}>{avg}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Mono',monospace" }}>PROM</div>
        </div>
      </div>
      {best && (
        <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#FFD700', fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>★ TOP</span>
          <span style={{ fontSize: 13, color: '#bbb', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {best.name}
          </span>
          <span style={{ fontSize: 11, color: '#444', fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>ver →</span>
        </div>
      )}
    </div>
  );
};

// ── Restaurant detail sheet ────────────────────────────────
const RestaurantSheet = ({ restaurant, onClose, onAddDish, onDeleteDish, onRefresh }) => {
  const [selectedDish, setSelectedDish] = useState(null);
  const [editingDish, setEditingDish]   = useState(null);
  const sorted = [...(restaurant.dishes || [])].sort((a,b) => b.rating - a.rating);
  return (
    <div className="overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{
        background: '#0e0e0e', borderRadius: '24px 24px 0 0', width: '100%',
        maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        border: '1px solid #2a2a2a', borderBottom: 'none',
      }}>
        {/* Handle */}
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, background: '#333', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ margin: '14px 20px 0', padding: 18, borderRadius: 16,
          background: `linear-gradient(135deg, ${restaurant.color}99, ${restaurant.color}22)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 30 }}>{restaurant.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 21, fontFamily: "'DM Serif Display',serif", color: '#fff' }}>
                {restaurant.name}
              </div>
              {restaurant.address && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  📍 {restaurant.address}
                </div>
              )}
            </div>
            <button onClick={() => shareRestaurant(restaurant)} style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 10, padding: '6px 10px', color: '#fff', cursor: 'pointer', fontSize: 14,
            }} title="Compartir favoritos">🔗</button>
          </div>
        </div>

        {/* Dishes list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16 }}>Sin platillos aún</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: '#444', fontFamily: "'DM Mono',monospace",
                letterSpacing: 1, textTransform: 'uppercase', padding: '14px 0 2px' }}>
                Platillos · mejor calificados primero
              </div>
              {sorted.map(d => (
                <DishRow key={d.id} dish={d} onSelect={setSelectedDish} />
              ))}
              <div style={{ height: 16 }} />
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px 36px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 13, borderRadius: 12, border: '1px solid #333',
            background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
          }}>Cerrar</button>
          <button onClick={() => onAddDish(restaurant)} style={{
            flex: 2, padding: 13, borderRadius: 12, border: 'none',
            background: '#FF6B35', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>+ Agregar platillo</button>
        </div>
      </div>

      {selectedDish && (
        <DishDetailModal
          dish={selectedDish}
          onClose={() => setSelectedDish(null)}
          onEdit={(d) => setEditingDish(d)}
          onDelete={(id) => { onDeleteDish(id); setSelectedDish(null); }}
        />
      )}
      {editingDish && (
        <EditDishSheet
          dish={editingDish}
          onClose={() => setEditingDish(null)}
          onSave={() => { setEditingDish(null); setSelectedDish(null); onRefresh(); }}
        />
      )}
    </div>
  );
};

// ── Add form sheet ─────────────────────────────────────────
const AddForm = ({ prefillResto, restaurants, onSave, onClose }) => {
  const [mode, setMode]               = useState(prefillResto ? 'existing' : 'new');
  const [selectedRestoId, setSelRestoId] = useState(prefillResto?.id || '');
  const [restoName, setRestoName]     = useState('');
  const [restoEmoji, setRestoEmoji]   = useState('🍽️');
  const [dishName, setDishName]       = useState('');
  const [rating, setRating]           = useState(8);
  const [notes, setNotes]             = useState('');
  const [addedBy, setAddedBy]         = useState('Rolo');
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [geoLoading, setGeoLoading]   = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [coords, setCoords]           = useState(null);
  const fileRef = useRef();

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    // AI identify
    await identifyDish(file, setDishName, setAiLoading);
  };

  const canSave = dishName.trim() && (mode === 'existing' ? selectedRestoId : restoName.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let restaurant_id = selectedRestoId;

      if (mode === 'new') {
        const color = PALETTE[restaurants.length % PALETTE.length];
        const newR = await addRestaurant({
          name: restoName.trim(), emoji: restoEmoji, color,
          lat: coords?.lat || null, lng: coords?.lng || null,
          address: null,
        });
        restaurant_id = newR.id;
      }

      let photo_url = null;
      if (photoFile) photo_url = await uploadPhoto(photoFile);

      await addDish({ restaurant_id, name: dishName.trim(), rating, notes: notes.trim(), photo_url, added_by: addedBy });
      onSave();
    } catch (err) {
      console.error(err);
      alert('Error guardando. Revisa la conexión.');
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 10, padding: '12px 14px', color: '#f0f0f0',
    fontSize: 15, outline: 'none',
  };

  return (
    <div className="overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div className="sheet" style={{
        background: '#0e0e0e', borderRadius: '24px 24px 0 0', width: '100%',
        maxWidth: 480, maxHeight: '93vh', overflowY: 'auto',
        border: '1px solid #2a2a2a', borderBottom: 'none',
      }}>
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, background: '#333', borderRadius: 2 }} />
        </div>

        <div style={{ padding: '18px 22px 42px' }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 20 }}>
            Nuevo platillo
          </div>

          {/* Quién agrega */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {['Rolo', 'Claudia'].map(name => (
              <button key={name} onClick={() => setAddedBy(name)} style={{
                flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                border: addedBy === name ? 'none' : '1px solid #333',
                background: addedBy === name ? '#FF6B35' : '#1a1a1a',
                color: addedBy === name ? '#fff' : '#888',
              }}>{name}</button>
            ))}
          </div>

          {/* Restaurante toggle */}
          {!prefillResto && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['existing', 'new'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                  border: mode === m ? 'none' : '1px solid #333',
                  background: mode === m ? '#2a2a2a' : '#1a1a1a',
                  color: mode === m ? '#f0f0f0' : '#666',
                }}>
                  {m === 'existing' ? 'Restaurante existente' : 'Nuevo restaurante'}
                </button>
              ))}
            </div>
          )}

          {/* Restaurante existente */}
          {mode === 'existing' && !prefillResto && (
            <div style={{ marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
              {restaurants.map(r => (
                <div key={r.id} onClick={() => setSelRestoId(r.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                  borderRadius: 12, cursor: 'pointer', marginBottom: 6,
                  border: selectedRestoId === r.id ? '1px solid #FF6B35' : '1px solid #2a2a2a',
                  background: selectedRestoId === r.id ? 'rgba(255,107,53,0.08)' : '#1a1a1a',
                }}>
                  <span style={{ fontSize: 18 }}>{r.emoji}</span>
                  <span style={{ fontSize: 15, color: '#f0f0f0' }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}

          {prefillResto && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 12, border: '1px solid #FF6B35', background: 'rgba(255,107,53,0.08)', marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>{prefillResto.emoji}</span>
              <span style={{ fontSize: 15, color: '#f0f0f0' }}>{prefillResto.name}</span>
            </div>
          )}

          {/* Restaurante nuevo */}
          {mode === 'new' && !prefillResto && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Nombre del restaurante"
                  value={restoName} onChange={e => setRestoName(e.target.value)} />
                <button onClick={() => getCurrentRestaurant(setRestoName, setCoords, setGeoLoading)}
                  disabled={geoLoading}
                  style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #2a2a2a',
                    background: '#1a1a1a', color: geoLoading ? '#555' : '#f0f0f0',
                    cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>
                  {geoLoading ? '⏳' : '📍'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EMOJIS.map(em => (
                  <div key={em} onClick={() => setRestoEmoji(em)} style={{
                    width: 38, height: 38, borderRadius: 10, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    cursor: 'pointer',
                    border: restoEmoji === em ? '2px solid #FF6B35' : '2px solid #2a2a2a',
                    background: restoEmoji === em ? 'rgba(255,107,53,0.1)' : '#1a1a1a',
                  }}>{em}</div>
                ))}
              </div>
            </div>
          )}

          {/* Foto */}
          <div onClick={() => fileRef.current.click()} style={{
            width: '100%', height: 130, borderRadius: 14, marginBottom: 14, cursor: 'pointer',
            background: photoPreview ? `url(${photoPreview}) center/cover` : '#1a1a1a',
            border: '2px dashed #333', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative',
          }}>
            {!photoPreview && (
              <>
                <span style={{ fontSize: 32 }}>📸</span>
                <span style={{ fontSize: 12, color: '#666' }}>
                  {aiLoading ? 'Identificando platillo…' : 'Foto del platillo (la IA lo identifica)'}
                </span>
              </>
            )}
            {aiLoading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, color: '#FF6B35', fontFamily: "'DM Mono',monospace" }}>
                  🤖 Identificando…
                </span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={handlePhoto} />
          </div>

          {/* Nombre platillo */}
          <input style={{ ...inp, marginBottom: 12 }} placeholder="Nombre del platillo"
            value={dishName} onChange={e => setDishName(e.target.value)} />

          {/* Rating */}
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
            padding: '14px 16px', marginBottom: 12 }}>
            <RatingBar value={rating} onChange={setRating} />
          </div>

          {/* Notas */}
          <textarea style={{ ...inp, height: 72 }}
            placeholder="Notas: sin picante, solo fines de semana, pedir doble…"
            value={notes} onChange={e => setNotes(e.target.value)} />

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={onClose} disabled={saving} style={{
              flex: 1, padding: 14, borderRadius: 12, border: '1px solid #333',
              background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={handleSave} disabled={!canSave || saving} style={{
              flex: 2, padding: 14, borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700,
              background: canSave && !saving ? '#FF6B35' : '#2a2a2a',
              color: canSave && !saving ? '#fff' : '#555',
              cursor: canSave && !saving ? 'pointer' : 'default', transition: 'all 0.2s',
            }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────
const PINS = { '2222': 'Rolo', '1111': 'Claudia' };

function PinScreen({ onUnlock }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState(false);
  const [shake, setShake]   = useState(false);

  const handleDigit = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      setTimeout(() => {
        if (PINS[next]) {
          localStorage.setItem('foodlog_user', PINS[next]);
          onUnlock(PINS[next]);
        } else {
          setShake(true);
          setError(true);
          setTimeout(() => { setPin(''); setShake(false); }, 600);
        }
      }, 120);
    }
  };

  const handleDel = () => { setPin(p => p.slice(0,-1)); setError(false); };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans',sans-serif", padding: 24,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#f0f0f0', marginBottom: 6 }}>
        FoodLog
      </div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 48, fontFamily: "'DM Mono',monospace" }}>
        Rolo & Claudia
      </div>

      {/* Dots */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 48,
        animation: shake ? 'shake 0.5s ease' : 'none',
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%', transition: 'background 0.15s',
            background: i < pin.length ? (error ? '#8B1A1A' : '#FF6B35') : '#2a2a2a',
            border: '2px solid ' + (i < pin.length ? (error ? '#8B1A1A' : '#FF6B35') : '#333'),
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: 240 }}>
        {digits.map((d, i) => (
          <button key={i} onClick={() => d === '⌫' ? handleDel() : d !== '' ? handleDigit(d) : null}
            disabled={d === ''}
            style={{
              height: 68, borderRadius: 16, border: 'none', fontSize: d === '⌫' ? 20 : 24,
              fontFamily: "'DM Mono',monospace", fontWeight: 600,
              background: d === '' ? 'transparent' : '#141414',
              color: d === '⌫' ? '#666' : '#f0f0f0',
              cursor: d === '' ? 'default' : 'pointer',
              transition: 'background 0.1s',
              boxShadow: d !== '' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}
            onMouseDown={e => { if (d !== '') e.currentTarget.style.background = '#2a2a2a'; }}
            onMouseUp={e => { if (d !== '') e.currentTarget.style.background = '#141414'; }}
          >
            {d}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}

export default function FoodLog() {
  const [user, setUser]               = useState(null);
  const [checking, setChecking]       = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeResto, setActiveResto] = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [addForResto, setAddForResto] = useState(null);
  const [search, setSearch]           = useState('');

  // Check localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('foodlog_user');
    if (saved && PINS[saved === 'Rolo' ? '2222' : '1111']) setUser(saved);
    setChecking(false);
  }, []);

  if (checking) return null;
  if (!user) return <PinScreen onUnlock={setUser} />;

  const load = useCallback(async () => {
    try {
      const data = await getRestaurants();
      setRestaurants(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = restaurants.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.dishes || []).some(d => d.name.toLowerCase().includes(search.toLowerCase()))
  );

  const mustOrder = restaurants
    .flatMap(r => (r.dishes || []).filter(d => d.rating >= 9).map(d => ({ ...d, restoName: r.name, restoEmoji: r.emoji })))
    .sort((a,b) => b.rating - a.rating);

  const totalDishes = restaurants.reduce((s,r) => s + (r.dishes?.length || 0), 0);
  const globalAvg = totalDishes
    ? (restaurants.flatMap(r => r.dishes || []).reduce((s,d) => s + d.rating, 0) / totalDishes).toFixed(1)
    : '—';

  const handleSaved = async () => {
    setShowAdd(false);
    setAddForResto(null);
    setActiveResto(null);
    await load();
  };

  const handleDeleteDish = async (dishId) => {
    await deleteDish(dishId);
    await load();
    // refresh activeResto
    if (activeResto) {
      const fresh = restaurants.find(r => r.id === activeResto.id);
      if (fresh) setActiveResto({ ...fresh, dishes: (fresh.dishes || []).filter(d => d.id !== dishId) });
    }
  };

  const openAddForResto = (resto) => {
    setActiveResto(null);
    setAddForResto(resto);
    setShowAdd(true);
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', maxWidth: 480,
      margin: '0 auto', paddingBottom: 80,
    }}>
      {/* Header */}
      <div style={{ padding: '44px 22px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: '#FF6B35', fontFamily: "'DM Mono',monospace",
              letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
              {user} · FoodLog
            </div>
            <div style={{ fontSize: 34, fontFamily: "'DM Serif Display',serif", lineHeight: 1.05, marginBottom: 6 }}>
              FoodLog
            </div>
            <div style={{ fontSize: 13, color: '#555' }}>
              {restaurants.length} restaurantes · {totalDishes} platillos
              {totalDishes > 0 && ` · ⭐ ${globalAvg}`}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button onClick={() => { setAddForResto(null); setShowAdd(true); }} style={{
              width: 52, height: 52, borderRadius: 16, border: 'none',
              background: '#FF6B35', color: '#fff', fontSize: 28, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(255,107,53,0.45)', flexShrink: 0,
            }}>+</button>
            <button onClick={() => { localStorage.removeItem('foodlog_user'); setUser(null); }} style={{
              background: 'none', border: 'none', color: '#333', fontSize: 11,
              fontFamily: "'DM Mono',monospace", cursor: 'pointer', letterSpacing: 1,
            }}>salir</button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 22px 18px' }}>
        <input style={{
          width: '100%', background: '#141414', border: '1px solid #222',
          borderRadius: 13, padding: '11px 16px', color: '#f0f0f0', fontSize: 14, outline: 'none',
        }} placeholder="🔍 Restaurante o platillo…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Must-order strip */}
      {!search && mustOrder.length > 0 && (
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ fontSize: 10, color: '#555', fontFamily: "'DM Mono',monospace",
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            🏆 Must-order · 9 y 10
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {mustOrder.map(d => (
              <div key={d.id} style={{
                flexShrink: 0, background: '#141414', border: '1px solid #FF6B35',
                borderRadius: 14, padding: '10px 14px', minWidth: 155,
              }}>
                <div style={{ fontSize: 10, color: '#FF6B35', fontFamily: "'DM Mono',monospace", marginBottom: 3 }}>
                  {d.restoEmoji} {d.restoName}
                </div>
                <div style={{ fontSize: 13, fontFamily: "'DM Serif Display',serif", color: '#f0f0f0', lineHeight: 1.2 }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 11, color: '#FFD700', marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                  ★ {d.rating}/10
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restaurant list */}
      <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#444' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }}>Cargando…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, marginBottom: 8 }}>
              {search ? 'Sin resultados' : 'Aún no hay restaurantes'}
            </div>
            {!search && (
              <div style={{ fontSize: 13 }}>Toca + para agregar tu primer platillo</div>
            )}
          </div>
        ) : filtered.map(r => (
          <RestaurantCard key={r.id} restaurant={r} onClick={() => setActiveResto(r)} />
        ))}
      </div>

      {/* Sheets */}
      {activeResto && (
        <RestaurantSheet
          restaurant={activeResto}
          onClose={() => setActiveResto(null)}
          onAddDish={openAddForResto}
          onDeleteDish={handleDeleteDish}
          onRefresh={load}
        />
      )}

      {showAdd && (
        <AddForm
          prefillResto={addForResto}
          restaurants={restaurants}
          onSave={handleSaved}
          onClose={() => { setShowAdd(false); setAddForResto(null); }}
        />
      )}
    </div>
  );
}
