import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Shield, Camera, Key, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';

export default function SecurityOnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Face, 2: Passkey, 3: Finish
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [passkeyEnrolled, setPasskeyEnrolled] = useState(false);

  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);

  // Passkey states
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');

  // Start camera on step 1
  useEffect(() => {
    if (step === 1 && !faceEnrolled) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step, faceEnrolled]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      setCameraError('Camera access denied or unavailable. Please allow camera permissions to enroll biometrics.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const captureAndEnrollFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    setCameraError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);

      const res = await api.post('/onboarding/face-enroll', { imageBase64 });
      if (res.data.template) {
        setFaceEnrolled(true);
        stopCamera();
        setStep(2);
      }
    } catch (err) {
      setCameraError(err.response?.data?.error || 'Biometric enrollment failed. Ensure a single well-lit face is centered in the frame.');
    } finally {
      setCapturing(false);
    }
  };

  const registerPasskey = async () => {
    setPasskeyLoading(true);
    setPasskeyError('');
    try {
      // 1. Request options from server
      const optRes = await api.post('/onboarding/webauthn/register-options');
      const options = optRes.data;

      // 2. Browser WebAuthn ceremony
      const attestationResponse = await startRegistration({ optionsJSON: options });

      // 3. Verify on server
      await api.post('/onboarding/webauthn/verify-registration', attestationResponse);

      setPasskeyEnrolled(true);
      setStep(3);
    } catch (err) {
      console.error('Passkey registration error:', err);
      setPasskeyError(err.response?.data?.error || err.message || 'Passkey creation cancelled or unsupported.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await api.post('/onboarding/complete');
      await refreshUser();
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not finalize setup.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#090d16]">
      <div className="w-full max-w-xl bg-[#0f172a] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 items-center justify-center text-sky-400 mb-1">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">First-Time Security Setup</h1>
          <p className="text-xs text-slate-400">Configure your hardware biometrics and passkey authentication factors</p>
        </div>

        {/* Stepper indicator */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`p-2.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${
            step === 1 ? 'bg-sky-500/10 border-sky-500/40 text-sky-400' : faceEnrolled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">1</span>
            <span>Face Biometrics</span>
          </div>

          <div className={`p-2.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${
            step === 2 ? 'bg-sky-500/10 border-sky-500/40 text-sky-400' : passkeyEnrolled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">2</span>
            <span>Passkey (FIDO2)</span>
          </div>

          <div className={`p-2.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${
            step === 3 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Vault Ready</span>
          </div>
        </div>

        {/* STEP 1: FACE ENROLLMENT */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-slate-100">Step 1: Face Recognition Enrollment</span>
              <p className="text-slate-400 mt-0.5">
                Your face template is extracted as a 512-dimensional vector using ArcFace and encrypted with AES-256-GCM. Raw photographs are never permanently stored.
              </p>
            </div>

            {cameraError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Camera Viewport */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Facial alignment guide oval */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-44 h-56 rounded-[50%] border-2 border-dashed border-sky-400/60 shadow-[0_0_50px_rgba(56,189,248,0.15)] flex items-center justify-center">
                  <div className="text-[10px] uppercase font-mono tracking-widest text-sky-400/80 bg-slate-950/70 px-2 py-1 rounded">
                    Align Face
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              {!cameraActive && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Start Camera</span>
                </button>
              )}

              <button
                type="button"
                disabled={capturing || !cameraActive}
                onClick={captureAndEnrollFace}
                className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>{capturing ? 'Extracting Embedding...' : 'Capture & Enroll Face'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PASSKEY REGISTRATION */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-slate-100">Step 2: WebAuthn / Passkey Registration</span>
              <p className="text-slate-400 mt-0.5">
                Register a hardware-backed cryptographic passkey (Windows Hello, Touch ID, or security key) used for High Sensitivity credential verification.
              </p>
            </div>

            {passkeyError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passkeyError}</span>
              </div>
            )}

            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 mx-auto flex items-center justify-center">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-200">Device Platform Authenticator</div>
                <div className="text-xs text-slate-400 mt-1">
                  Click below to trigger your browser's native FIDO2 / WebAuthn passkey registration prompt.
                </div>
              </div>

              <button
                type="button"
                disabled={passkeyLoading}
                onClick={registerPasskey}
                className="py-2.5 px-6 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition inline-flex items-center space-x-2 shadow-lg shadow-sky-600/20 disabled:opacity-50"
              >
                <Key className="w-4 h-4" />
                <span>{passkeyLoading ? 'Authenticating with Device...' : 'Register Hardware Passkey'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: FINALIZATION */}
        {step === 3 && (
          <div className="space-y-4 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">Security Configuration Complete</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Your master account now has biometric face authentication and hardware passkeys active. Your personal vault starts clean and empty.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={completeOnboarding}
                className="py-3 px-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition inline-flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
              >
                <span>Enter Empty Vault</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
