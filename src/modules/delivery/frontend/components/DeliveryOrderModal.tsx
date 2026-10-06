// DeliveryOrderModal.tsx
// Configuration modal for Delivery Orders (Used in Billing Flow A and Flow B)

import React, { useState } from 'react';
import { Truck, MapPin, Clock, Calendar, Plus, X, Check, DollarSign, UserCheck, AlertCircle, Scissors } from 'lucide-react';
import { useCustomerAddresses, useDeliveryZones, useDeliveryDrivers, useSaveCustomerAddress } from '../hooks/useDelivery';
import { CreateDeliveryInput, CustomerAddress, DeliveryType, DeliveryPriority } from '../../types/delivery.types';
import AddressMapPickerModal from './AddressMapPickerModal';
import { formatPaise } from '../../../customers/frontend/types/customer.types';

interface DeliveryOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
  customerName?: string;
  subtotalPaise: number;
  initialValues?: Partial<CreateDeliveryInput>;
  onConfirm: (config: CreateDeliveryInput) => void;
}

const TIME_SLOTS = [
  { start: '08:00', end: '10:00', label: 'Morning (08:00 AM - 10:00 AM)' },
  { start: '10:00', end: '12:00', label: 'Pre-Noon (10:00 AM - 12:00 PM)' },
  { start: '12:00', end: '14:00', label: 'Afternoon (12:00 PM - 02:00 PM)' },
  { start: '16:00', end: '18:00', label: 'Evening (04:00 PM - 06:00 PM)' },
  { start: '18:00', end: '20:30', label: 'Night Peak (06:00 PM - 08:30 PM)' },
];

const PREP_PRESETS = [
  'Curry Cut (Medium)',
  'Small Pieces (Biryani Cut)',
  'Boneless Skinless',
  'With Bone & Fat',
  'Keema Mince (Fine)',
  'Thigh & Breast Separate',
  'Cleaned & Washed',
];

export const DeliveryOrderModal: React.FC<DeliveryOrderModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName = 'Valued Customer',
  subtotalPaise,
  initialValues,
  onConfirm,
}) => {
  const { data: addresses = [], isLoading: isLoadingAddresses } = useCustomerAddresses(customerId);
  const { data: zones = [] } = useDeliveryZones();
  const { data: drivers = [] } = useDeliveryDrivers();
  const saveAddressMutation = useSaveCustomerAddress();

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(
    initialValues?.customer_address_id || null
  );
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(
    initialValues?.zone_id || null
  );
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    initialValues?.delivery_type || 'immediate'
  );
  const [priority, setPriority] = useState<DeliveryPriority>(
    initialValues?.priority || 'normal'
  );
  const [requestedDate, setRequestedDate] = useState<string>(
    initialValues?.requested_date || new Date().toISOString().slice(0, 10)
  );
  const [timeSlot, setTimeSlot] = useState<{ start: string; end: string }>(() => {
    if (initialValues?.time_slot_start && initialValues?.time_slot_end) {
      return { start: initialValues.time_slot_start, end: initialValues.time_slot_end };
    }
    return { start: '10:00', end: '12:00' };
  });

  const [assignedDriverId, setAssignedDriverId] = useState<number | null>(
    initialValues?.driver_id || null
  );
  const [specialPrep, setSpecialPrep] = useState<string>(
    initialValues?.special_prep_instructions || ''
  );
  const [customerNotes, setCustomerNotes] = useState<string>(
    initialValues?.customer_notes || ''
  );

  // Address creation sub-state
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [newAddrDoor, setNewAddrDoor] = useState('');
  const [newAddrBuilding, setNewAddrBuilding] = useState('');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrArea, setNewAddrArea] = useState('');
  const [newAddrLandmark, setNewAddrLandmark] = useState('');
  const [newAddrPincode, setNewAddrPincode] = useState('560001');
  const [newAddrLat, setNewAddrLat] = useState<number | null>(null);
  const [newAddrLng, setNewAddrLng] = useState<number | null>(null);

  // Determine active zone
  const activeZone = zones.find(z => z.id === selectedZoneId) || zones.find(z => z.is_default) || zones[0];
  
  // Calculate delivery charge (Default to Free Delivery: ₹0)
  let computedDeliveryFee = activeZone ? activeZone.delivery_charge_paise : 0;
  if (activeZone?.free_delivery_above_paise && subtotalPaise >= activeZone.free_delivery_above_paise) {
    computedDeliveryFee = 0;
  }

  const handleSaveNewAddress = async () => {
    if (!newAddrArea.trim()) {
      alert('Please enter an area or locality name.');
      return;
    }
    try {
      const created = await saveAddressMutation.mutateAsync({
        input: {
          customer_id: customerId,
          door_no: newAddrDoor,
          building: newAddrBuilding,
          street: newAddrStreet,
          area: newAddrArea,
          landmark: newAddrLandmark,
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: newAddrPincode,
          latitude: newAddrLat,
          longitude: newAddrLng,
          is_default: 1,
        }
      });
      setSelectedAddressId(created.id);
      setIsAddingNewAddress(false);
    } catch (e: any) {
      alert(e.message || 'Failed to save address');
    }
  };

  const handleConfirmOrder = () => {
    let finalAddressId = selectedAddressId;
    if (!finalAddressId && addresses.length > 0) {
      finalAddressId = addresses[0].id;
    }

    onConfirm({
      customer_id: customerId,
      customer_address_id: finalAddressId || undefined,
      zone_id: activeZone?.id || 1,
      driver_id: assignedDriverId || undefined,
      delivery_type: deliveryType,
      priority,
      requested_date: requestedDate,
      time_slot_start: deliveryType === 'scheduled' ? timeSlot.start : undefined,
      time_slot_end: deliveryType === 'scheduled' ? timeSlot.end : undefined,
      delivery_charge_paise: computedDeliveryFee,
      special_prep_instructions: specialPrep || undefined,
      customer_notes: customerNotes || undefined,
      payment_method: 'cod',
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-app border border-border-subtle rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center border border-brand-500/20">
              <Truck size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-text-primary">Configure Home Delivery Order</h3>
              <p className="text-xs text-text-muted">Customer: <span className="font-semibold text-text-primary">{customerName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* 1. Address Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-text-primary flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-text-muted">
                <MapPin size={13} className="text-brand-500" />
                Delivery Doorstep Address
              </label>
              {!isAddingNewAddress && (
                <button
                  type="button"
                  onClick={() => setIsAddingNewAddress(true)}
                  className="text-brand-500 hover:text-brand-600 font-bold flex items-center gap-1 text-[11px]"
                >
                  <Plus size={12} /> Add New Address
                </button>
              )}
            </div>

            {isAddingNewAddress ? (
              <div className="p-3.5 bg-surface-panel border border-brand-500/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between font-bold text-text-primary">
                  <span>Enter New Delivery Address</span>
                  <button
                    onClick={() => setIsMapPickerOpen(true)}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold text-xs"
                  >
                    <MapPin size={12} />
                    {newAddrLat ? 'Pin Placed ✅' : 'Drop Pin on Map'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Door / Flat #"
                    value={newAddrDoor}
                    onChange={e => setNewAddrDoor(e.target.value)}
                    className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Building / Apartment"
                    value={newAddrBuilding}
                    onChange={e => setNewAddrBuilding(e.target.value)}
                    className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Street / Cross"
                    value={newAddrStreet}
                    onChange={e => setNewAddrStreet(e.target.value)}
                    className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Area / Locality *"
                    value={newAddrArea}
                    onChange={e => setNewAddrArea(e.target.value)}
                    className="px-3 py-1.5 bg-surface-card border border-brand-500/50 rounded-lg text-text-primary outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="PIN Code"
                    value={newAddrPincode}
                    onChange={e => setNewAddrPincode(e.target.value)}
                    className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500"
                  />
                </div>

                <input
                  type="text"
                  placeholder="Landmark (Optional e.g. Opposite Park)"
                  value={newAddrLandmark}
                  onChange={e => setNewAddrLandmark(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingNewAddress(false)}
                    className="px-3 py-1 text-text-muted hover:text-text-primary rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewAddress}
                    className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm"
                  >
                    Save Address
                  </button>
                </div>
              </div>
            ) : addresses.length === 0 ? (
              <div className="p-4 bg-surface-card border border-dashed border-border-subtle rounded-xl text-center space-y-2">
                <p className="text-text-muted">No saved addresses found for this customer.</p>
                <button
                  type="button"
                  onClick={() => setIsAddingNewAddress(true)}
                  className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs inline-flex items-center gap-1"
                >
                  <Plus size={13} /> Add Doorstep Address
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {addresses.map(addr => {
                  const isSelected = selectedAddressId === addr.id || (!selectedAddressId && addr.is_default === 1);
                  return (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-500/10 shadow-sm'
                          : 'border-border-subtle bg-surface-card hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-text-primary flex items-center gap-1">
                          {addr.label}
                          {addr.is_default === 1 && <span className="text-amber-400 text-[10px]">⭐ Default</span>}
                        </span>
                        {isSelected && <Check size={14} className="text-brand-500 font-bold" />}
                      </div>
                      <p className="text-text-secondary text-[11px] leading-relaxed truncate">
                        {[addr.door_no, addr.building, addr.street, addr.area].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-text-muted text-[10px]">{addr.city} — {addr.pincode}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Timing & Delivery Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Clock size={12} /> Delivery Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDeliveryType('immediate')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    deliveryType === 'immediate'
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'bg-surface-panel border border-border-subtle text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  ⚡ Immediate (30-45m)
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType('scheduled')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    deliveryType === 'scheduled'
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'bg-surface-panel border border-border-subtle text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  📅 Scheduled Slot
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Calendar size={12} /> Target Date
              </label>
              <input
                type="date"
                value={requestedDate}
                onChange={e => setRequestedDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-xl text-text-primary outline-none focus:border-brand-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Scheduled Slot Picker */}
          {deliveryType === 'scheduled' && (
            <div className="space-y-1.5">
              <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted">
                Select Time Window
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_SLOTS.map((slot, idx) => {
                  const isSelected = timeSlot.start === slot.start && timeSlot.end === slot.end;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTimeSlot({ start: slot.start, end: slot.end })}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-bold'
                          : 'border-border-subtle bg-surface-card text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <span className="block text-[11px] font-bold">{slot.start} - {slot.end}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Delivery Zone & Surcharge */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted">
                Delivery Zone
              </label>
              <select
                value={selectedZoneId || activeZone?.id || 1}
                onChange={e => setSelectedZoneId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-xl text-text-primary outline-none focus:border-brand-500 text-xs"
              >
                {zones.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.name} (₹{(z.delivery_charge_paise / 100).toFixed(0)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span>Delivery Fee</span>
                {computedDeliveryFee === 0 && <span className="text-emerald-400 font-bold text-[10px]">Free Delivery</span>}
              </label>
              <div className="px-3 py-2 bg-surface-panel border border-border-subtle rounded-xl text-text-primary font-mono font-bold flex items-center justify-between">
                <span>₹{(computedDeliveryFee / 100).toFixed(2)}</span>
                <span className="text-[10px] text-text-muted font-normal">Auto-added to bill</span>
              </div>
            </div>
          </div>

          {/* 4. Special Prep Instructions */}
          <div className="space-y-1.5">
            <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <Scissors size={12} /> Special Butchery / Prep Instructions
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {PREP_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSpecialPrep(prev => prev ? `${prev}, ${preset}` : preset)}
                  className="px-2 py-0.5 bg-surface-panel hover:bg-surface-hover border border-border-subtle rounded-md text-[10px] text-text-secondary transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="e.g. Curry cut, boneless, small pieces for biryani"
              value={specialPrep}
              onChange={e => setSpecialPrep(e.target.value)}
              className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-xl text-text-primary outline-none focus:border-brand-500 text-xs"
            />
          </div>

          {/* 5. Driver Assignment (Optional Manual) */}
          <div className="space-y-1.5">
            <label className="font-bold text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <UserCheck size={12} /> Assign Delivery Driver (Optional)
            </label>
            <select
              value={assignedDriverId || ''}
              onChange={e => setAssignedDriverId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-surface-card border border-border-subtle rounded-xl text-text-primary outline-none focus:border-brand-500 text-xs"
            >
              <option value="">Auto / Assign at Dispatch Counter</option>
              {drivers.filter(d => d.is_active).map(drv => (
                <option key={drv.id} value={drv.id}>
                  {drv.name} ({drv.vehicle_number || drv.phone}) — {drv.active_deliveries_count || 0} active orders
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-panel flex items-center justify-between">
          <div className="text-xs">
            <span className="text-text-muted">Total Payable: </span>
            <span className="font-extrabold font-mono text-sm text-brand-500">
              {formatPaise(subtotalPaise + computedDeliveryFee)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmOrder}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/20 flex items-center gap-1.5 transition-all"
            >
              <Check size={14} />
              <span>Apply Delivery to Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* Address Pin-Drop Map Modal */}
      {isMapPickerOpen && (
        <AddressMapPickerModal
          isOpen={isMapPickerOpen}
          onClose={() => setIsMapPickerOpen(false)}
          initialLat={newAddrLat}
          initialLng={newAddrLng}
          addressLabel={newAddrArea || 'Customer Address'}
          onSelectCoordinates={(lat, lng) => {
            setNewAddrLat(lat);
            setNewAddrLng(lng);
          }}
        />
      )}
    </div>
  );
};

export default DeliveryOrderModal;
