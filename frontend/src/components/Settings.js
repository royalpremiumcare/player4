import { useState, useEffect } from "react";
import { Package, User, UserCog, Briefcase, HelpCircle, LogOut, ChevronRight, CreditCard, ArrowLeft, DollarSign, ChartBar } from "lucide-react"; 
import { Card } from "@/components/ui/card";

const Settings = ({ onNavigate, userRole, onLogout }) => {
  return (
    <div className="min-h-screen bg-gray-50 pb-20" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="px-4 pt-6 pb-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
        <div className="space-y-4">
            <div className="mb-4">
              <button
                onClick={() => onNavigate && onNavigate("dashboard")}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 mb-4 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Anasayfaya Dön</span>
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Ayarlar</h2>
                <p className="text-sm text-gray-600 mt-1">Hesap ve sistem ayarlarınızı yönetin</p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Personel için sadece Profilim göster */}
              {userRole === 'staff' && (
                <button
                  onClick={() => onNavigate && onNavigate("settings-profile")}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <User className="w-5 h-5 text-green-600" />
              </div>
              <div>
                      <p className="text-base font-semibold text-gray-900">Profilim</p>
                      <p className="text-xs text-gray-600">Kişisel bilgiler ve hesap ayarları</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              )}

              {/* Admin için tüm ayarlar */}
              {userRole === 'admin' && (
                <>
                  {/* 1. İşletme Ayarları */}
                  <button
                    onClick={() => onNavigate && onNavigate("settings-profile")}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <User className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">İşletme Ayarları</p>
                        <p className="text-xs text-gray-600">İşletme bilgileri ve genel ayarlar</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  {/* 2. Personel Yönetimi */}
                  <button
                    onClick={() => onNavigate && onNavigate("staff")}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <UserCog className="w-5 h-5 text-purple-600" />
                </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">Personel Yönetimi</p>
                        <p className="text-xs text-gray-600">Personel ekleme ve yönetimi</p>
              </div>
            </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  {/* 3. Hizmet Yönetimi */}
                  <button
                    onClick={() => onNavigate && onNavigate("services")}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Briefcase className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                        <p className="text-base font-semibold text-gray-900">Hizmet Yönetimi</p>
                        <p className="text-xs text-gray-600">Hizmet ekleme ve fiyatlandırma</p>
              </div>
            </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  {/* 4. Finans & Kasa Yönetimi */}
                  <button
                    onClick={() => onNavigate && onNavigate("settings-finance")}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-gray-900">Finans & Kasa Yönetimi</p>
                      <p className="text-xs text-gray-600">Gelir, Gider ve Personel Ödemelerini Yönetin</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>

                  {/* 5. Abonelik ve Faturalandırma */}
                  <button
                    onClick={() => onNavigate && onNavigate("settings-subscription")}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-blue-600" />
              </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">Abonelik ve Faturalandırma</p>
                        <p className="text-xs text-gray-600">Paket bilgileri ve ödeme ayarları</p>
            </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </>
              )}

              <button
                onClick={() => onNavigate && onNavigate("help-center")}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <HelpCircle className="w-5 h-5 text-indigo-600" />
            </div>
              <div>
                    <p className="text-base font-semibold text-gray-900">Yardım Merkezi</p>
                    <p className="text-xs text-gray-600">Sık sorulan sorular ve destek</p>
            </div>
          </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>

              <button
                onClick={onLogout}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <LogOut className="w-5 h-5 text-red-600" />
              </div>
              <div>
                    <p className="text-base font-semibold text-red-600">Çıkış Yap</p>
                    <p className="text-xs text-red-500">Hesabınızdan güvenli şekilde çıkış yapın</p>
              </div>
            </div>
                <ChevronRight className="w-5 h-5 text-red-400" />
              </button>
            </div>
          </div>
      </Card>
      </div>
    </div>
  );
};

export default Settings;
