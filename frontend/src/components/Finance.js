import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Edit2, DollarSign, TrendingUp, TrendingDown, Calendar, X } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const Finance = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState("summary");
  const [period, setPeriod] = useState("this_month");
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    category: "Diğer",
    date: format(new Date(), "yyyy-MM-dd")
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd")
  });

  const expenseCategories = ["Fatura", "Kira", "Malzeme", "Personel Ödemesi", "Diğer"];

  useEffect(() => {
    loadData();
  }, [activeTab, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "summary") {
        const response = await api.get(`/finance/summary?period=${period}`);
        setSummary(response.data);
      } else if (activeTab === "expenses") {
        const response = await api.get("/expenses");
        setExpenses(response.data || []);
      } else if (activeTab === "payroll") {
        const response = await api.get(`/finance/payroll?period=${period}`);
        setPayroll(response.data);
      }
    } catch (error) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseForm.title || !expenseForm.amount || !expenseForm.date) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    try {
      await api.post("/expenses", {
        title: expenseForm.title,
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category,
        date: expenseForm.date
      });
      toast.success("Gider eklendi");
      setShowExpenseDialog(false);
      setExpenseForm({ title: "", amount: "", category: "Diğer", date: format(new Date(), "yyyy-MM-dd") });
      // Verileri yeniden yükle
      setLoading(true);
      try {
        if (activeTab === "summary") {
          const summaryResponse = await api.get(`/finance/summary?period=${period}`);
          setSummary(summaryResponse.data);
        }
        if (activeTab === "expenses") {
          const expensesResponse = await api.get("/expenses");
          setExpenses(expensesResponse.data || []);
        }
      } catch (error) {
        console.error("Data reload error:", error);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      toast.error("Gider eklenemedi");
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return;

    try {
      await api.delete(`/expenses/${deleteExpenseId}`);
      toast.success("Gider silindi");
      setDeleteExpenseId(null);
      await loadData();
      if (activeTab === "summary") {
        const response = await api.get(`/finance/summary?period=${period}`);
        setSummary(response.data);
      }
    } catch (error) {
      toast.error("Gider silinemedi");
    }
  };

  const handleMakePayment = async () => {
    if (!selectedStaff || !paymentForm.amount) {
      toast.error("Lütfen tutarı girin");
      return;
    }

    try {
      const response = await api.post("/finance/payroll/payment", {
        staff_username: selectedStaff.username,
        amount: parseFloat(paymentForm.amount),
        date: paymentForm.date
      });
      console.log("Payment response:", response.data);
      toast.success("Ödeme kaydedildi");
      setShowPaymentDialog(false);
      setSelectedStaff(null);
      setPaymentForm({ amount: "", date: format(new Date(), "yyyy-MM-dd") });
      // Verileri yeniden yükle
      setLoading(true);
      try {
        if (activeTab === "summary") {
          const summaryResponse = await api.get(`/finance/summary?period=${period}`);
          setSummary(summaryResponse.data);
        }
        if (activeTab === "expenses") {
          const expensesResponse = await api.get("/expenses");
          setExpenses(expensesResponse.data || []);
        }
        if (activeTab === "payroll") {
          const payrollResponse = await api.get(`/finance/payroll?period=${period}`);
          setPayroll(payrollResponse.data);
        }
      } catch (error) {
        console.error("Data reload error:", error);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error("Payment error:", error);
      const errorMessage = error.response?.data?.detail || error.message || "Ödeme kaydedilemedi";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate && onNavigate("settings")}
          className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Ayarlara Dön</span>
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Finans & Kasa Yönetimi</h2>
        <p className="text-sm text-gray-600 mt-1">Gelir, gider ve personel ödemelerini yönetin</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Özet</TabsTrigger>
          <TabsTrigger value="expenses">Giderler</TabsTrigger>
          <TabsTrigger value="payroll">Personel</TabsTrigger>
        </TabsList>

        {/* SEKME 1: Özet */}
        <TabsContent value="summary" className="space-y-4">
          {/* Tarih Filtresi */}
          <div className="flex gap-2">
            <Button
              variant={period === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod("today")}
            >
              Bugün
            </Button>
            <Button
              variant={period === "this_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod("this_month")}
            >
              Bu Ay
            </Button>
            <Button
              variant={period === "last_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod("last_month")}
            >
              Geçen Ay
            </Button>
          </div>

          {loading ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Yükleniyor...</p>
            </Card>
          ) : summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Toplam Gelir */}
              <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 font-medium mb-1">Toplam Gelir</p>
                    <p className="text-3xl font-bold text-green-900">
                      {Math.round(summary.total_revenue || 0).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-600" />
                </div>
              </Card>

              {/* Toplam Gider */}
              <Card className="p-6 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700 font-medium mb-1">Toplam Gider</p>
                    <p className="text-3xl font-bold text-red-900">
                      {Math.round(summary.total_expenses || 0).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                  <TrendingDown className="w-10 h-10 text-red-600" />
                </div>
              </Card>

              {/* Net Kâr */}
              <Card className={`p-6 bg-gradient-to-br ${summary.net_profit >= 0 ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-gray-50 to-gray-100 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: summary.net_profit >= 0 ? '#1e40af' : '#374151' }}>
                      Net Kâr
                    </p>
                    <p className={`text-3xl font-bold ${summary.net_profit >= 0 ? 'text-blue-900' : 'text-gray-900'}`}>
                      {Math.round(summary.net_profit || 0).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* SEKME 2: Giderler */}
        <TabsContent value="expenses" className="space-y-4">
          {loading ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Yükleniyor...</p>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {expenses.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-gray-500">Henüz gider kaydı yok</p>
                  </Card>
                ) : (
                  expenses.map((expense) => (
                    <Card key={expense.id} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{expense.title}</h3>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-sm text-gray-600">
                              {format(new Date(expense.date), "d MMMM yyyy", { locale: tr })}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                              {expense.category}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-red-600">
                            {expense.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0} ₺
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteExpenseId(expense.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* FAB: Gider Ekle */}
              <div className="fixed bottom-20 right-4 z-50">
                <Button
                  onClick={() => setShowExpenseDialog(true)}
                  className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* SEKME 3: Personel */}
        <TabsContent value="payroll" className="space-y-4">
          {/* Tarih Filtresi */}
          <div className="flex gap-2">
            <Button
              variant={period === "this_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod("this_month")}
            >
              Bu Ay
            </Button>
            <Button
              variant={period === "last_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod("last_month")}
            >
              Geçen Ay
            </Button>
          </div>

          {loading ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Yükleniyor...</p>
            </Card>
          ) : payroll && payroll.payroll ? (
            <div className="space-y-3">
              {payroll.payroll.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-gray-500">Personel bulunamadı</p>
                </Card>
              ) : (
                payroll.payroll.map((staff) => (
                  <Card key={staff.username} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{staff.full_name}</h3>
                        <p className="text-sm text-gray-600">
                          {staff.payment_type === "salary" 
                            ? `Sabit Maaş - ${staff.payment_amount?.toLocaleString('tr-TR') || 0} ₺`
                            : `Komisyon - %${staff.payment_amount || 0}`
                          }
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Hakediş</p>
                        <p className="text-lg font-bold text-green-600">
                          {staff.earned?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0} ₺
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Ödenen</p>
                        <p className="text-lg font-bold text-blue-600">
                          {staff.paid?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0} ₺
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Kalan Bakiye</p>
                        <p className={`text-lg font-bold ${staff.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {staff.balance?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0} ₺
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedStaff(staff);
                        setShowPaymentDialog(true);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                    >
                      Ödeme Yap
                    </Button>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Gider Ekleme Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Gider Ekle</DialogTitle>
            <DialogDescription>
              Yeni bir gider kaydı oluşturun.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expense_title">Başlık *</Label>
              <Input
                id="expense_title"
                value={expenseForm.title}
                onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                placeholder="Örn: Kira Ödemesi"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_amount">Tutar (TL) *</Label>
              <Input
                id="expense_amount"
                type="number"
                min="0"
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_category">Kategori *</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(value) => setExpenseForm({ ...expenseForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_date">Tarih *</Label>
              <Input
                id="expense_date"
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowExpenseDialog(false)}
              className="flex-1"
            >
              İptal
            </Button>
            <Button
              onClick={handleAddExpense}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ödeme Yapma Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedStaff?.full_name} - Ödeme Yap</DialogTitle>
            <DialogDescription>
              Personel ödemesini kaydedin. Bu işlem giderler listesine eklenecektir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment_amount">Tutar (TL) *</Label>
              <Input
                id="payment_amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_date">Tarih *</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPaymentDialog(false);
                setSelectedStaff(null);
              }}
              className="flex-1"
            >
              İptal
            </Button>
            <Button
              onClick={handleMakePayment}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gider Silme Onay Dialog */}
      <AlertDialog open={!!deleteExpenseId} onOpenChange={() => setDeleteExpenseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gideri Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu gideri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              className="bg-red-500 hover:bg-red-600"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Finance;

