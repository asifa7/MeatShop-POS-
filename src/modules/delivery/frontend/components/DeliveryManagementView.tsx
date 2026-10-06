import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Phone,
  User,
  MapPin,
  DollarSign,
  Calendar,
  Check,
  X,
  Edit3,
  CreditCard,
  Banknote,
  Wallet,
} from 'lucide-react';
import {
  useDeliveries,
  useMarkDelivered,
  useMarkPaymentReceived,
} from '../hooks/useDelivery';
import { DeliveryOrder } from '../../types/delivery.types';
import DateRangePicker from '../../../../core/shared/DateRangePicker';

type TabKey = 'open' | 'delivered_pending' | 'closed' | 'all';

export const DeliveryManagementView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const deliveryFilters = useMemo(() => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [startDate, endDate]);

  const { data: deliveries = [], isLoading, refetch, isFetching } = useDeliveries(deliveryFilters);

  const queryClient = useQueryClient();
  const markDeliveredMutation = useMarkDelivered();
  const markPaymentReceivedMutation = useMarkPaymentReceived();

  const handleRefresh = async () => {
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
    await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    await queryClient.invalidateQueries({ queryKey: ['delivery-stats'] });
    refetch();
  };

  // Categorize deliveries
  const categorized = useMemo(() => {
    const open: DeliveryOrder[] = [];
    const deliveredPending: DeliveryOrder[] = [];
    const closed: DeliveryOrder[] = [];

    for (const d of deliveries) {
      const isDelivered = Boolean(d.delivered === 1 || d.status === 'delivered');
      const isPaid = Boolean(d.payment_received === 1 || d.payment_status === 'paid');

      if (isDelivered && isPaid) {
        closed.push(d);
      } else if (isDelivered && !isPaid) {
        deliveredPending.push(d);
      } else {
        open.push(d);
      }
    }

    return { open, deliveredPending, closed };
  }, [deliveries]);

  // Filter by search
  const filterBySearch = (list: DeliveryOrder[]) => {
    if (!searchTerm.trim()) return list;
    const query = searchTerm.toLowerCase().trim();
    return list.filter(d => {
      const matchesBill = (d.invoice_number || '').toLowerCase().includes(query) || String(d.id).includes(query);
      const matchesCustomer = (d.customer_name || '').toLowerCase().includes(query);
      const matchesPhone = (d.customer_phone || '').includes(query);
      const matchesAddress = (d.delivery_address_snapshot || '').toLowerCase().includes(query);
      return matchesBill || matchesCustomer || matchesPhone || matchesAddress;
    });
  };

  const getActiveList = (): DeliveryOrder[] => {
    switch (activeTab) {
      case 'open': return filterBySearch(categorized.open);
      case 'delivered_pending': return filterBySearch(categorized.deliveredPending);
      case 'closed': return filterBySearch(categorized.closed);
      case 'all': return filterBySearch(deliveries);
      default: return [];
    }
  };

  const activeList = getActiveList();

  // Handle Toggle Delivered
  const handleToggleDelivered = async (delivery: DeliveryOrder, nextDelivered: boolean) => {
    try {
      await markDeliveredMutation.mutateAsync({
        deliveryId: delivery.id,
        isDelivered: nextDelivered,
      });
      refetch();
    } catch (err: any) {
      alert(`Failed to update delivery status: ${err?.message || 'Unknown error'}`);
    }
  };

  // Handle Toggle Payment Received
  const handleTogglePayment = async (delivery: DeliveryOrder, nextPaid: boolean) => {
    try {
      await markPaymentReceivedMutation.mutateAsync({
        deliveryId: delivery.id,
        isPaid: nextPaid,
      });
      refetch();
    } catch (err: any) {
      alert(`Failed to update payment status: ${err?.message || 'Unknown error'}`);
    }
  };

  // Close ticket = mark both delivered + paid
  const handleCloseTicket = async (delivery: DeliveryOrder) => {
    try {
      const isDelivered = Boolean(delivery.delivered === 1 || delivery.status === 'delivered');
      const isPaid = Boolean(delivery.payment_received === 1 || delivery.payment_status === 'paid');
      if (!isDelivered) {
        await markDeliveredMutation.mutateAsync({ deliveryId: delivery.id, isDelivered: true });
      }
      if (!isPaid) {
        await markPaymentReceivedMutation.mutateAsync({ deliveryId: delivery.id, isPaid: true });
      }
      refetch();
    } catch (err: any) {
      alert(`Failed to close ticket: ${err?.message || 'Unknown error'}`);
    }
  };

  // Reopen ticket = unmark both
  const handleReopenTicket = async (delivery: DeliveryOrder) => {
    try {
      await markDeliveredMutation.mutateAsync({ deliveryId: delivery.id, isDelivered: false });
      await markPaymentReceivedMutation.mutateAsync({ deliveryId: delivery.id, isPaid: false });
      refetch();
    } catch (err: any) {
      alert(`Failed to reopen ticket: ${err?.message || 'Unknown error'}`);
    }
  };

  const tabs: { key: TabKey; label: string; count: number; color: string; icon: React.ReactNode }[] = [
    { key: 'open', label: 'Open', count: categorized.open.length, color: 'amber', icon: <Clock size={14} /> },
    { key: 'delivered_pending', label: 'Payment Pending', count: categorized.deliveredPending.length, color: 'blue', icon: <Wallet size={14} /> },
    { key: 'closed', label: 'Closed', count: categorized.closed.length, color: 'emerald', icon: <CheckCircle2 size={14} /> },
    { key: 'all', label: 'All', count: deliveries.length, color: 'gray', icon: <Truck size={14} /> },
  ];

  const getPaymentMethodIcon = (method?: string) => {
    switch (method?.toLowerCase()) {
      case 'upi': return <Wallet size={11} className="text-purple-400" />;
      case 'card': return <CreditCard size={11} className="text-blue-400" />;
      default: return <Banknote size={11} className="text-emerald-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-base text-text-primary overflow-hidden p-4 sm:p-6 gap-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500">
              <Truck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-text-primary tracking-tight">Delivery Orders</h1>
              <p className="text-xs text-text-muted">Open → Delivered (Payment Pending) → Closed</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-bold text-text-secondary cursor-pointer transition-colors shadow-xs"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-surface-card border border-border-subtle rounded-2xl p-1.5 shrink-0 shadow-xs">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          const colorMap: Record<string, string> = {
            amber: isActive ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'text-text-muted hover:text-amber-400 hover:bg-amber-500/10',
            blue: isActive ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'text-text-muted hover:text-blue-400 hover:bg-blue-500/10',
            emerald: isActive ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'text-text-muted hover:text-emerald-400 hover:bg-emerald-500/10',
            gray: isActive ? 'bg-surface-hover border-border-subtle text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
          };
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                isActive ? colorMap[tab.color] : `border-transparent ${colorMap[tab.color]}`
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/10' : 'bg-surface-card'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Date Filter */}
      <div className="p-3 bg-surface-card border border-border-subtle rounded-2xl flex flex-wrap items-center gap-3 shrink-0 shadow-xs">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by Bill #, Customer, Phone, Address..."
            className="w-full pl-9 pr-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs font-semibold text-text-primary outline-none focus:border-brand-500"
          />
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
          labelFrom="From"
          labelTo="To"
        />
      </div>

      {/* Delivery Cards/Table */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
            Loading delivery orders...
          </div>
        ) : activeList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
            <Truck size={36} className="opacity-25 mb-2" />
            <p className="text-sm font-bold text-text-secondary">
              {activeTab === 'open' ? 'No open delivery tickets' :
               activeTab === 'delivered_pending' ? 'No tickets awaiting payment' :
               activeTab === 'closed' ? 'No closed tickets' : 'No delivery tickets found'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {activeTab === 'open'
                ? 'All deliveries are either completed or awaiting payment collection.'
                : 'Bills marked as "Home Delivery" during checkout automatically appear here.'}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
            {activeList.map(delivery => {
              const isDelivered = Boolean(delivery.delivered === 1 || delivery.status === 'delivered');
              const isPaid = Boolean(delivery.payment_received === 1 || delivery.payment_status === 'paid');
              const isFullyClosed = isDelivered && isPaid;
              const billTotal = ((delivery.total_paise || 0) / 100).toFixed(2);
              const deliveryFee = delivery.delivery_charge_paise ? (delivery.delivery_charge_paise / 100).toFixed(2) : null;
              const billRef = delivery.invoice_number?.split('_')[0] || delivery.invoice_number || delivery.id;

              return (
                <div
                  key={delivery.id}
                  className={`bg-surface-card border rounded-2xl p-4 shadow-xs transition-all ${
                    isFullyClosed
                      ? 'border-emerald-500/20 opacity-75'
                      : isDelivered
                      ? 'border-blue-500/20'
                      : 'border-amber-500/20'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isFullyClosed ? 'bg-emerald-500/15 text-emerald-400' :
                        isDelivered ? 'bg-blue-500/15 text-blue-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>
                        {isFullyClosed ? <CheckCircle2 size={18} /> : isDelivered ? <DollarSign size={18} /> : <Truck size={18} />}
                      </div>
                      <div>
                        <div className="font-mono font-black text-brand-500 text-sm">
                          #{billRef}
                        </div>
                        <div className="font-mono text-[10px] text-text-muted mt-0.5">
                          {delivery.created_at ? new Date(delivery.created_at).toLocaleDateString() : '-'}{' '}
                          {delivery.created_at ? new Date(delivery.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {isFullyClosed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 size={11} /> Closed
                        </span>
                      ) : isDelivered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          <Wallet size={11} /> Payment Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <Clock size={11} /> Open
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body — Customer & Amount */}
                  <div className="flex items-start justify-between mb-3 gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-extrabold text-text-primary text-xs flex items-center gap-1.5">
                        <User size={12} className="text-text-muted shrink-0" />
                        {delivery.customer_name || <span className="text-text-muted italic font-normal">(No name)</span>}
                      </div>
                      {delivery.customer_phone && (
                        <div className="font-mono text-[11px] text-text-muted flex items-center gap-1.5">
                          <Phone size={11} className="shrink-0" />
                          {delivery.customer_phone}
                        </div>
                      )}
                      {delivery.delivery_address_snapshot ? (
                        <div className="text-[11px] text-text-secondary flex items-start gap-1.5">
                          <MapPin size={12} className="text-brand-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{delivery.delivery_address_snapshot}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-text-muted italic">No address given</div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-black text-lg text-text-primary font-mono">
                        ₹{billTotal}
                      </div>
                      {deliveryFee && (
                        <div className="text-[10px] text-text-muted">incl. ₹{deliveryFee} fee</div>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {getPaymentMethodIcon(delivery.payment_method)}
                        <span className="text-[10px] font-bold text-text-muted uppercase">{delivery.payment_method || 'cash'}</span>
                      </div>
                      {Boolean(delivery.amount_pending_paise && delivery.amount_pending_paise > 0) && (
                        <div className="text-[10px] font-bold text-amber-400 mt-0.5">
                          ₹{((delivery.amount_pending_paise || 0) / 100).toFixed(2)} credit pending
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-3 border-t border-border-subtle/50">
                    {/* Delivery Toggle */}
                    {isDelivered ? (
                      <button
                        type="button"
                        onClick={() => handleToggleDelivered(delivery, false)}
                        title="Click to revert delivery status"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
                      >
                        <CheckCircle2 size={13} /> ✓ Delivered
                        {delivery.delivered_at && (
                          <span className="text-[9px] font-mono text-emerald-400/70 ml-1">
                            {new Date(delivery.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleDelivered(delivery, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors cursor-pointer active:scale-95"
                      >
                        <Truck size={13} /> Mark Delivered
                      </button>
                    )}

                    {/* Payment Toggle */}
                    {isPaid ? (
                      <button
                        type="button"
                        onClick={() => handleTogglePayment(delivery, false)}
                        title="Click to revert payment status"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
                      >
                        <CheckCircle2 size={13} /> ✓ Payment Received
                        {delivery.payment_received_at && (
                          <span className="text-[9px] font-mono text-emerald-400/70 ml-1">
                            {new Date(delivery.payment_received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTogglePayment(delivery, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer active:scale-95"
                      >
                        <DollarSign size={13} /> Payment Received
                      </button>
                    )}

                    <div className="flex-1" />

                    {/* Quick Close / Reopen */}
                    {isFullyClosed ? (
                      <button
                        type="button"
                        onClick={() => handleReopenTicket(delivery)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer"
                        title="Reopen this ticket"
                      >
                        <Edit3 size={12} /> Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCloseTicket(delivery)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all cursor-pointer"
                        title="Close ticket (marks both delivered + paid)"
                      >
                        <CheckCircle2 size={12} /> Close Ticket
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryManagementView;