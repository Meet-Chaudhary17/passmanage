import React, { useState, useRef, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import api from '../services/api';
import { X, Shield, Camera, Key, Lock, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';

export default function VerificationModal({ credential, isOpen, onClose }) {
  const [phase, setPhase] = useState('INIT'); // 'INIT', 'FACE', 'PASSKEY', 'UNLOCKED', 'ERROR'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlockedData, setUnlockedData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Camera
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (isOpen && credential) {
      initiate();
    } else {
      stopCamera();
      setPhase('INIT');
      setUnlockedData(null);
      setError('');
    }
  }, [isOpen, credential]);

  useEffect(() => {
    if (phase === 'FACE') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [phase]);

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

  const initiate = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/vault/${credential.id}/initiate-access`);

      if (res.data.authorized && res.data.releaseToken) {
        // Shareable: already authorized by session
        await releaseWithToken(res.data.releaseToken);
      } else if (res.data.requiredStep === 'FACE') {
        setPhase('FACE');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate access verification.');
      setPhase('ERROR');
    } finally {
      setLoading(false);
    }
  };

  const verifyFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setLoading(true);
    setError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);

      const res = await api.post(`/vault/${credential.id}/verify-face`, { imageBase64 });

      if (res.data.authorized && res.data.releaseToken) {
        // Restricted complete!
        stopCamera();
        await releaseWithToken(res.data.releaseToken);
      } else if (res.data.nextStep === 'PASSKEY') {
        // High sensitivity: advance to passkey
        stopCamera();
        setPhase('PASSKEY');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Face verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyPasskey = async () => {
    setLoading(true);
    setError('');

    try {
      const optRes = await api.get(`/vault/${credential.id}/passkey-options`);
      const options = optRes.data;

      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await api.post(`/vault/${credential.id}/verify-passkey`, assertion);

      if (verifyRes.data.authorized && verifyRes.data.releaseToken) {
        await releaseWithToken(verifyRes.data.releaseToken);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Passkey ceremony failed or cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const releaseWithToken = async (releaseToken) => {
    try {
      const res = await api.post(`/vault/${credential.id}/release`, { releaseToken });
      setUnlockedData(res.data);
      setPhase('UNLOCKED');
    } catch (err) {
      setError(err.response?.data?.error || 'Decryption failed. Release token invalid or expired.');
      setPhase('ERROR');
    }
  };

  const copyPassword = () => {
    if (!unlockedData?.password) return;
    navigator.clipboard.writeText(unlockedData.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">Security Verification</h3>
              <p className="text-xs text-slate-400">{credential?.website_name} ({credential?.category})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="px-6 pb-6 space-y-4 text-xs">
          {/* PHASE: INIT (Loading) */}
          {phase === 'INIT' && (
            <div className="text-center py-6 space-y-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p>Evaluating server authorization policy...</p>
            </div>
          )}

          {/* PHASE: FACE VERIFICATION */}
          {phase === 'FACE' && (
            <div className="space-y-3">
              <div className="text-slate-300">
                <span className="font-semibold text-slate-100">Step: Biometric Face Verification</span>
                <p className="text-slate-400 mt-0.5 text-[11px]">
                  Position your face in the oval frame and click verify.
                </p>
              </div>

              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-36 h-44 rounded-[50%] border-2 border-dashed border-amber-400/60 shadow-[0_0_30px_rgba(245,158,11,0.15)] flex items-center justify-center">
                    <span className="text-[9px] uppercase tracking-widest text-amber-300 bg-slate-950/70 px-1.5 py-0.5 rounded">Scan</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={loading || !cameraActive}
                onClick={verifyFace}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-600/20 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>{loading ? 'Verifying Embedding...' : 'Verify Facial Biometrics'}</span>
              </button>
            </div>
          )}

          {/* PHASE: PASSKEY VERIFICATION */}
          {phase === 'PASSKEY' && (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-100 text-sm">Step 2: Hardware Passkey</h4>
                <p className="text-slate-400 text-[11px] mt-1">
                  Face verified successfully. Now verify your registered FIDO2 passkey (Windows Hello / Touch ID) to release this high-sensitivity credential.
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={verifyPasskey}
                className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                <Key className="w-4 h-4" />
                <span>{loading ? 'Awaiting Passkey Ceremony...' : 'Verify Hardware Passkey'}</span>
              </button>
            </div>
          )}

          {/* PHASE: UNLOCKED */}
          {phase === 'UNLOCKED' && unlockedData && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center space-x-2 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Verification successful. Credential decrypted from vault.</span>
              </div>

              <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Username</div>
                  <div className="text-xs text-slate-200 font-mono mt-0.5">{unlockedData.username}</div>
                </div>

                <div className="pt-2 border-t border-slate-850">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Password</div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-sky-400 font-mono select-all">{unlockedData.password}</div>
                    <button
                      onClick={copyPassword}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center space-x-1"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {unlockedData.notes && (
                  <div className="pt-2 border-t border-slate-850">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Notes</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-wrap">{unlockedData.notes}</div>
                  </div>
                )}
              </div>

              <div className="text-[10px] text-slate-500 text-center">
                Password was decrypted in RAM using authenticated AES-256-GCM and single-use authorization token.
              </div>
            </div>
          )}

          {phase === 'ERROR' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={initiate}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-medium"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
