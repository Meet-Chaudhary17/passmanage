import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import api from '../services/api';
import { Shield, Camera, Key, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function VerifyBridgePage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState('FACE'); // 'FACE', 'PASSKEY', 'DONE'

  // Camera states
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Passkey loading
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing verification sessionId parameter.');
      setLoading(false);
      return;
    }
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/verification/${sessionId}`);
      setSession(res.data);
      if (res.data.status === 'COMPLETED') {
        setStep('DONE');
      } else if (res.data.faceVerified && res.data.category === 'HIGH_SENSITIVITY') {
        setStep('PASSKEY');
      } else {
        setStep('FACE');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired verification session.');
    } finally {
      setLoading(false);
    }
  };

  // Manage camera
  useEffect(() => {
    if (step === 'FACE' && session && session.status !== 'COMPLETED') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step, session]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setError('Camera access required for facial biometric verification.');
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

  const handleVerifyFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    setError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);

      const res = await api.post(`/verification/${sessionId}/face`, { imageBase64 });

      if (res.data.completed) {
        stopCamera();
        setStep('DONE');
      } else if (res.data.nextStep === 'PASSKEY') {
        stopCamera();
        setStep('PASSKEY');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Face verification failed. Please align your face.');
    } finally {
      setCapturing(false);
    }
  };

  const handleVerifyPasskey = async () => {
    setPasskeyLoading(true);
    setError('');

    try {
      const optRes = await api.get(`/verification/${sessionId}/passkey-options`);
      const options = optRes.data;

      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await api.post(`/verification/${sessionId}/passkey`, assertion);

      if (verifyRes.data.completed) {
        setStep('DONE');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Passkey ceremony failed.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#090d16]">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100 text-base">PassManage Companion Auth</h2>
            <p className="text-xs text-slate-400">
              {session ? `${session.websiteName} (${session.category})` : 'Progressive Verification Bridge'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p>Loading verification session...</p>
          </div>
        ) : step === 'FACE' ? (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-slate-100">Step: Facial Biometric Scan</span>
              <p className="text-slate-400 mt-0.5 text-[11px]">
                Your extension requested access to an authenticated credential. Position your face in the oval and click verify.
              </p>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-36 h-44 rounded-[50%] border-2 border-dashed border-sky-400/60 shadow-[0_0_30px_rgba(56,189,248,0.15)] flex items-center justify-center">
                  <span className="text-[9px] uppercase tracking-widest text-sky-400 bg-slate-950/70 px-1.5 py-0.5 rounded">
                    Align Face
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={capturing || !cameraActive}
              onClick={handleVerifyFace}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>{capturing ? 'Verifying Embedding...' : 'Verify Biometrics'}</span>
            </button>
          </div>
        ) : step === 'PASSKEY' ? (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">Step 2: Hardware Passkey Required</h3>
              <p className="text-slate-400 text-[11px] mt-1">
                Biometrics passed. Touch your registered FIDO2 security key or use Windows Hello to authorize autofill.
              </p>
            </div>

            <button
              type="button"
              disabled={passkeyLoading}
              onClick={handleVerifyPasskey}
              className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/20 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{passkeyLoading ? 'Awaiting Passkey Ceremony...' : 'Verify Passkey Now'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-100">Verification Complete!</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Your authorization was approved and transmitted to the companion extension. You may now close this tab.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => window.close()}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition"
              >
                Close Tab
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
