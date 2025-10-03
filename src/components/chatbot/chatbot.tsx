"use client"

import { useState, useRef, useEffect, useContext } from "react"
import Image from "next/image"
import { supabase } from "@/lib/supabaseClient"
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import React from "react"
import {ChatContext, ChatContextType} from "@/context/ChatContext"

type Message = {
    question: string
    answer: string
}

const SatisfactionInline = ({
    conversationId,
    onDone,
}: {
    conversationId: string
    onDone: () => void
}) => {
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState<number | null>(null)
    const [endedAt] = useState(new Date())

    const handleVote = async (score: number) => {
        setLoading(true)
        setSelected(score)
        await supabase
            .from("conversations")
            .update({ satisfaction: score })
            .eq("id", conversationId)
        setLoading(false)
        setTimeout(onDone, 800)
    }

    return (
        <div className="flex flex-col items-center w-full py-5">
            <div className="bg-white w-full sm:max-w-md px-4 py-4 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center">
                <p className="font-semibold text-gray-700 text-sm mb-2">
                    How helpful was this conversation? <span className="text-xs text-gray-400">(optional)</span>
                </p>
                <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            type="button"
                            aria-label={`Rate ${n} stars`}
                            className={`
                                text-lg px-1 transition-colors
                                ${selected === n
                                    ? "text-yellow-400 scale-110"
                                    : "text-gray-300 hover:text-yellow-400"
                                }
                            `}
                            key={n}
                            onClick={() => handleVote(n)}
                            disabled={loading || selected !== null}
                        >
                            ★
                        </button>
                    ))}
                </div>
                <div className="text-xs text-gray-500 mb-1">1 = Not helpful, 5 = Very helpful</div>
                {loading && <span className="text-xs text-gray-400 mt-2">Saving...</span>}
                {selected !== null && !loading && (
                    <span className="text-xs text-green-600 mt-2">Thank you for your feedback!</span>
                )}
            </div>
            {/* Divider with chat ended info */}
            <div className="relative flex items-center w-full my-4">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="mx-3 text-xs text-gray-400 bg-white px-2 py-1 rounded-full shadow-sm">
                    Chat Ended · {endedAt.toLocaleString()}
                </span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>
        </div>
    )
}

const getLocalUser = () => {
    if (typeof window === "undefined") return null
    try {
        const data = localStorage.getItem("chat_profile")
        return data ? JSON.parse(data) : null
    } catch {
        return null
    }
}

const setLocalUser = (profile: { name: string; email: string }) => {
    if (typeof window === "undefined") return
    localStorage.setItem("chat_profile", JSON.stringify(profile))
}

const ChatWidget = () => {
    const [open, setOpen] = useState(false)
    const [responses, setResponses] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [isTyping, setIsTyping] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const [showSatisfactionInline, setShowSatisfactionInline] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const [profile, setProfile] = useState<{ name: string; email: string } | null>(null)
    const [userMessage, setUserMessage] = useState("")
    const [showSuggested, setShowSuggested] = useState(true);
    const [bubbleVisible, setBubbleVisible] = useState(false);
    const [isCoding, setIsCoding] = useState(false);
    const {contextMessage} = useContext(ChatContext);

    useEffect(() => {
      setOpen(true);
      setUserMessage(contextMessage)
    }, [contextMessage])

    const SUGGESTED_MESSAGE = "I need help";

    function parseJwt(token: string) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 640)
        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    // Block scroll when open in mobile
    useEffect(() => {
        if (isMobile && open) document.body.style.overflow = "hidden"
        else document.body.style.overflow = ""
        return () => { document.body.style.overflow = "" }
    }, [isMobile, open])

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [responses, isTyping, showSatisfactionInline])

    // Cargar perfil de usuario (localStorage o Google)
    useEffect(() => {
        const local = getLocalUser()
        if (local && local.name && local.email) {
            setProfile(local)
        }
    }, [])

    // Cargar historial si el usuario ya existe
    useEffect(() => {
        if (open && profile && !conversationId) {
            (async () => {
                setLoading(true)
                const { data: existing } = await supabase
                    .from("conversations")
                    .select("id")
                    .eq("email", profile.email)
                    .order("created_at", { ascending: false })
                    .limit(1)
                let convId = existing?.[0]?.id
                if (convId) {
                    // Cargar historial
                    const { data: msgs } = await supabase
                        .from("messages")
                        .select("role, content")
                        .eq("conversation_id", convId)
                        .order("created_at", { ascending: true })
                    const mapped =
                        Array.isArray(msgs) && msgs.length > 0
                            ? msgs.reduce<Message[]>((acc, cur) => {
                                if (cur.role === "user") {
                                    acc.push({ question: cur.content, answer: "" })
                                } else if (cur.role === "bot" && acc.length > 0) {
                                    acc[acc.length - 1].answer = cur.content
                                }
                                return acc
                            }, [])
                            : []
                    setResponses(mapped)
                    setConversationId(convId)
                }
                setLoading(false)
            })()
        }
        // eslint-disable-next-line
    }, [open, profile])

    // Detectar afirmativo para finalizar chat y mostrar puntuación
    useEffect(() => {
        if (
            showSatisfactionInline &&
            responses.length > 0 &&
            conversationId
        ) {
            const lastUserMsg = responses[responses.length - 1]?.question?.toLowerCase() || ""
            if (
                /(sí|si|yes|finalizar|cerrar|terminar)/i.test(lastUserMsg)
            ) {
                setShowSatisfactionInline(false)
                setResponses((prev) => [
                    ...prev,
                    { question: "", answer: "¡Gracias por conversar con nosotros!" },
                ])
                setTimeout(() => setShowSatisfactionInline(true), 500)
            }
        }
        // eslint-disable-next-line
    }, [responses, showSatisfactionInline])

    const handleGoogleSuccess = async (credentialResponse: any) => {
        const { credential } = credentialResponse;
        const userInfo = parseJwt(credential);
        const { name, email } = userInfo;
        setProfile({ name, email });
        setLocalUser({ name, email });
        // Buscar o crear conversación
        const { data: existing } = await supabase
            .from("conversations")
            .select("id")
            .eq("email", email)
            .order("created_at", { ascending: false })
            .limit(1)
        let convId = existing?.[0]?.id
        if (!convId) {
            const { data: inserted } = await supabase
                .from("conversations")
                .insert([{ name, email }])
                .select("id")
                .single()
            convId = inserted?.id
        }
        setConversationId(convId)
    }

    const handleSend = async (message?: string, convIdParam?: string | null) => {
        const msg = typeof message === "string" ? message : userMessage
        const convId = convIdParam || conversationId
        if (!profile?.email || !convId || !msg) return

        setUserMessage("")
        setLoading(true)
        setResponses((prev) => [...prev, { question: msg, answer: "" }])

        // Guardar mensaje usuario en supabase
        await supabase.from("messages").insert([
            { conversation_id: convId, role: "user", content: msg },
        ])

        setTimeout(() => {
            setIsTyping(true)
            setLoading(false)
        }, 500)

        try {
            const res = await fetch("/api/openai", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ prompt: msg, conversationId: convId }),
            })
            const data = await res.json()
            // Ocultar [END_CHAT] pero disparar lógica
            const isChatEnd = /\[END_CHAT\]/gi.test(data.reply)
            const isPrototype = /\[ADD_PROTOTYPE\]/gi.test(data.reply)

            const prototypeMatch = /'''([\s\S]+?)'''/i.exec(data.reply);
            const prototypePrompt = prototypeMatch ? prototypeMatch[1].trim() : "";

            let botAnswer = data.reply
            // Extrae el prompt y lo elimina de la respuesta
            .replace(/'''([\s\S]+?)'''/gi, "")
            .replace(/\[END_CHAT\]/gi, "")
            .replace(/\[ADD_PROTOTYPE\]/gi, "")
            .replace(/\[TALK_WITH_AGENT]/gi, "")
            .trim();

            await supabase.from("messages").insert([
                { conversation_id: convId, role: "bot", content: botAnswer },
            ])

            setTimeout(() => {
                setResponses((prev) =>
                    prev.map((item, index) =>
                        index === prev.length - 1 ? { ...item, answer: botAnswer } : item
                    )
                )
                setIsTyping(false)
                // Detectar finalización de chat

                if (isPrototype) {
                    handlePrototypeSave(prototypePrompt);
                }

                if (isChatEnd) {
                    const chatEndedMsg = `Chat Ended · ${new Date().toLocaleString()}`;
                    setResponses((prev) => [
                        ...prev,
                        { question: "", answer: chatEndedMsg }
                    ]);
                    (async () => {
                        await supabase.from("messages").insert([
                            {
                                conversation_id: convId,
                                role: "system",
                                content: chatEndedMsg,
                            }
                        ]);
                    })();
                    setShowSatisfactionInline(true);
                }
            }, 1000)

            async function handlePrototypeSave(userPrompt: string) {

                setIsCoding(true);
                // 1. Genera un UUID (usa crypto.randomUUID o uuidv4)
                const uuid =
                    typeof crypto !== "undefined" && crypto.randomUUID
                        ? crypto.randomUUID()
                        : (await import("uuid")).v4();

                // 2. Nombre y email
                const protoName = `Prototype by ${profile?.name || "User"}`;
                const protoEmail = profile?.email || "";

                // 3. Llama a tu endpoint que integra v0.dev
                let preview_url = "";
                let chat_id = "";
                let prototype_id = "";
                try {
                    const v0res = await fetch("/api/v0", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: userPrompt, email: protoEmail, name: protoName }),
                    });
                    const v0json = await v0res.json();
                    preview_url = v0json.preview_url;
                    chat_id = v0json.chat_id;
                } catch (e) {
                    preview_url = `/prototype/${uuid}`; // fallback local
                }

                let prototype;
                if (chat_id) {
                    // Buscar el prototipo usando chat_id (más confiable que email por si hay varios)
                    const { data, error } = await supabase
                        .from("prototypes")
                        .select("id")
                        .eq("chat_id", chat_id)
                        .order("created_at", { ascending: false })
                        .limit(1);

                    if (data && data.length > 0) {
                        prototype_id = data[0].id;
                    }
                }

                // Fallback si no hay chat_id (raro, pero posible)
                if (!prototype_id) {
                    // Buscar por email y preview_url como backup
                    const { data } = await supabase
                        .from("prototypes")
                        .select("id")
                        .eq("email", protoEmail)
                        .eq("preview_url", preview_url)
                        .order("created_at", { ascending: false })
                        .limit(1);

                    if (data && data.length > 0) {
                        prototype_id = data[0].id;
                    }
                }

                // 5. Envía mensaje de respuesta al usuario con el link real
                const protoMsg = prototype_id && preview_url
                    ? `✅ Prototype created! Preview it here: /prototype/${prototype_id}`
                    : `❌ Error creating prototype.`;

                setResponses((prev) => [
                    ...prev,
                    {
                        question: "",
                        answer: protoMsg,
                    },
                ]);

                await supabase.from("messages").insert([
                    {
                        conversation_id: conversationId,
                        role: "bot",
                        content: protoMsg,
                    },
                ]);

                setIsCoding(false);
            }

        } catch (error) {
            setResponses((prev) =>
                prev.map((item, index) =>
                    index === prev.length - 1
                        ? { ...item, answer: "Lo siento, ocurrió un error. Inténtalo de nuevo." }
                        : item
                )
            )
            setIsTyping(false)
        }
    }

    const handleClose = () => {
        setOpen(false)
        setShowSatisfactionInline(false)
        setUserMessage("")
    }

    useEffect(() => {
        if (!open) {
            const showBubble = () => {
                setBubbleVisible(true);
                setTimeout(() => setBubbleVisible(false), 7000);
            };
            // Mostrar la primera vez tras 2 segundos
            const initial = setTimeout(showBubble, 2000);
            // Luego cada 25 segundos
            const interval = setInterval(showBubble, 25000);
            return () => {
                clearInterval(interval);
                clearTimeout(initial);
            };
        } else {
            setBubbleVisible(false);
        }
    }, [open]);

    const TypingIndicator = () => (
        <div className="flex gap-2 items-start mt-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--principal-button-color)] flex items-center justify-center shadow-sm">
                <Image
                    src="/base/LOGO-N-WHITE.svg"
                    className="w-4 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                    width={20}
                    height={20}
                    alt="Chatbot Icon"
                />
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-[var(--principal-button-color)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="w-2 h-2 bg-[var(--principal-button-color)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="w-2 h-2 bg-[var(--principal-button-color)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
            </div>
        </div>
    )

    const CodingIndicator = () => (
        <div className="flex gap-2 items-start mt-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--principal-button-color)] flex items-center justify-center shadow-sm">
                <Image
                    src="/base/LOGO-N-WHITE.svg"
                    className="w-4 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                    width={20}
                    height={20}
                    alt="Chatbot Icon"
                />
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm flex flex-col items-start min-w-[180px]">
                <div className="flex gap-1 items-center mb-1">
                    <span className="text-xs font-semibold text-[var(--principal-button-color)] tracking-wide uppercase">
                        Generating code
                    </span>
                    <span className="ml-1 animate-pulse text-[var(--principal-button-color)]">
                        <AnimatedDots />
                    </span>
                </div>
                {/* Animated Skeleton Lines */}
                <div className="space-y-1 w-full">
                    <div className="h-2 w-3/4 bg-gradient-to-r from-gray-200 via-[var(--principal-button-color)] to-gray-200 rounded animate-coding-bar"></div>
                    <div className="h-2 w-1/2 bg-gradient-to-r from-gray-200 via-[var(--principal-button-color)] to-gray-200 rounded animate-coding-bar delay-150"></div>
                    <div className="h-2 w-2/3 bg-gradient-to-r from-gray-200 via-[var(--principal-button-color)] to-gray-200 rounded animate-coding-bar delay-300"></div>
                </div>
                <style jsx global>{`
                    @keyframes coding-bar {
                        0% {
                            background-position: -200px 0;
                        }
                        100% {
                            background-position: calc(200px + 100%) 0;
                        }
                    }
                    .animate-coding-bar {
                        background-size: 200px 100%;
                        animation: coding-bar 1.2s linear infinite;
                    }
                `}</style>
            </div>
        </div>
    );

    const AnimatedDots = () => (
        <span>
            <span className="animate-bounce">.</span>
            <span className="animate-bounce delay-150">.</span>
            <span className="animate-bounce delay-300">.</span>
        </span>
    );

    // Botón flotante
    if (!open) {
        return (
            <div className="fixed bottom-6 right-6 z-50 sm:bottom-6 sm:right-6 flex flex-col items-end gap-2">
                {/* Burbuja animada  */}
                {bubbleVisible && (
                    <div className="mb-2 animate-fade-in-out bg-white border border-gray-200 px-4 py-2 rounded-2xl shadow text-gray-700 text-sm flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--principal-button-color)] flex items-center justify-center">
                            <Image
                                src="/base/LOGO-N-WHITE.svg"
                                className="w-4 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                                width={20}
                                height={20}
                                alt="Chatbot Icon"
                            />
                        </div>
                        <span>Chat with me!</span>
                    </div>
                )}
                {/* Botón de abrir chat */}
                <button
                    className="group relative bg-[var(--principal-button-color)] rounded-full w-20 h-20 flex items-center justify-center transition-all duration-300 ease-out hover:scale-110 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-200"
                    onClick={() => setOpen(true)}
                    aria-label="Abrir chat de IA"
                >
                    <div className="absolute inset-0 rounded-full"></div>
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></div>
                </button>
            </div>
        );
    }

    function linkify(text: string): (string | React.JSX.Element)[] {
        const urlRegex = /(https?:\/\/[^\s]+)|(\/prototype[^\s]*)/g;
        const elements: (string | React.JSX.Element)[] = [];
        let lastIndex = 0;

        // Usamos replace solo para iterar las coincidencias, NO para modificar el texto
        text.replace(urlRegex, (url, _group, _group2, offset) => {
            // Agrega el texto previo al link
            if (lastIndex < offset) {
                elements.push(text.slice(lastIndex, offset));
            }
            elements.push(
                <a
                    key={offset}
                    href={url}
                    className="underline text-blue-600"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Link
                </a>
            );
            lastIndex = offset + url.length;
            return url;
        });

        // Agrega el texto que queda después del último link
        if (lastIndex < text.length) {
            elements.push(text.slice(lastIndex));
        }

        return elements;
    }

    function formatBotResponse(text: string): React.ReactNode {
        const parts = text.split(/(?=\d+\.\s)/g);

        if (parts.length > 1) {
            return (
            <div>
                {parts.map((part, idx) => (
                <div key={idx}>{linkify(part.trim())}</div>
                ))}
            </div>
            );
        }

        // Para saltos de línea normales:
        return (
            <div>
            {text.split('\n').map((line, idx) => (
                <div key={idx}>{linkify(line)}</div>
            ))}
            </div>
        );
    }

    return (
        <div
            className={`
            fixed z-50
            ${isMobile
                    ? "inset-0 w-full h-full max-w-full max-h-full"
                    : "bottom-6 right-6 max-w-sm w-full"
                }
            `}
            style={isMobile ? {
                padding: 0,
                margin: 0,
                width: '100vw',
                height: '100dvh',
                maxWidth: '100vw',
                maxHeight: '100dvh',
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.05)'
            } : {}}
        >
            <div className={`relative flex flex-col ${isMobile ? "h-full w-full" : "p-4"}`}>
                <div
                    className={`
                flex flex-col shadow-2xl border border-[var(--secondary-border-color)] backdrop-blur-sm
                ${isMobile
                            ? "h-full w-full max-w-full max-h-full rounded-none"
                            : "rounded-3xl"
                        }
                `}
                    style={isMobile ? {
                        height: '100dvh',
                        width: '100vw',
                        maxHeight: '100dvh',
                        maxWidth: '100vw',
                        overflow: 'hidden'
                    } : {}}
                >

                    {/* Botón de cerrar */}
                    <button
                        className={`absolute ${isMobile ? "top-4 right-4" : "-top-2 -right-2"} 
                        bg-white border-2 border-gray-200 rounded-full w-10 h-10 flex items-center justify-center shadow-lg 
                        hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all duration-200 z-10 group`}
                        onClick={handleClose}
                        aria-label="Cerrar chat"
                    >
                        <svg
                            className="w-5 h-5 transition-transform group-hover:rotate-90"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Header */}
                    <div className={`
                    relative px-6 py-5 bg-[var(--principal-background-color)]
                    ${isMobile ? "" : "rounded-t-3xl"}
                    flex-shrink-0
                `}>
                        <div className={`absolute inset-0 bg-gray-800/30 ${isMobile ? "" : "rounded-t-3xl"}`}></div>
                        <div className="relative flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Image
                                    src="/base/LOGO-N-WHITE.svg"
                                    className="w-5 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                                    width={20}
                                    height={20}
                                    alt="Chatbot Icon"
                                />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Maxwell Aldridge</h2>
                                <p className="text-white/80 text-sm">Always here to help you</p>
                            </div>
                        </div>
                    </div>

                    {/* LOGIN: Si no hay perfil, muestra mensaje de bienvenida y Google Login */}
                    {!profile && (
                        <div className="flex flex-col items-center justify-center flex-1 bg-[var(--principal-background-color)] rounded-b-3xl gap-6 p-8">
                            <div className="text-lg font-bold text-white">Welcome! I'm here for you</div>
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() => alert("Google login failed")}
                                useOneTap
                            />
                        </div>
                    )}

                    {/* CHAT: Si hay perfil, muestra el chat */}
                    {profile && (
                        <>
                            {/* Chat history */}
                            <div
                                className={`
                                flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-[var(--principal-background-color)] custom-scrollbar
                                ${isMobile
                                        ? "max-h-none min-h-0"
                                        : "max-h-80"
                                    }
                            `}
                                style={isMobile ? {
                                    height: "1px",
                                    minHeight: 0,
                                    flexGrow: 1,
                                    overflowX: 'hidden'
                                } : { minHeight: 200, overflowX: 'hidden' }}
                            >
                                {responses.length === 0 && (
                                    <div className="m-auto">
                                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--principal-background-color)] flex items-center justify-center">
                                            <Image
                                                src="/base/profesor.gif"
                                                className="w-16 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                                                width={64}
                                                height={64}
                                                alt="Chatbot Icon"
                                            />
                                        </div>
                                        <h4 className="text-white text-base font-medium text-center ">What can Maxwell do for you?</h4>
                                        <p className="text-gray-200 text-xs text-center mb-4">He creates ultra-efficient tech solutions for any sector and delivers 100% interactive, tailor-made prototypes.</p>
                                        <ul className="text-gray-400 text-xs mt-1 list-decimal px-2">
                                            <li className="ml-4 mb-5">State your goal in one sentence. Examples: <br/>
                                              <span className="italic">“Create an Amazon/Shopify–style store with catalog, cart, and shipping, so we centralize sales and automate invoicing.”</span><br/><br/>
                                              <span className="italic">“Launch an Airbnb–style marketplace to rent spaces/rooms/equipment with calendar and secure payments, so we monetize idle inventory.”</span>
                                            </li>

                                            <li className="ml-4 mb-5">Answer one question at a time</li>

                                            <li className="ml-4 mb-5">Share links/assets and metrics (if you have them).</li>

                                            <li className="ml-4 mb-5">Ask for the prototype or the project summary.</li>

                                            <li className="ml-4">List your change requests for the project (1, 2, 3).</li>
                                        </ul>
                                    </div>
                                )}

                                {responses.map((res, index) => (
                                    <div key={index} className="space-y-3">
                                        {/* Pregunta usuario */}
                                        {res.question && (
                                            <div className="flex gap-3 items-start justify-end">
                                                <div className="rounded-2xl bg-[var(--principal-button-color)] px-4 py-3 text-white text-sm max-w-[80%] shadow-lg">
                                                    {res.question}
                                                </div>
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--principal-button-color)] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M10 2a4 4 0 100 8 4 4 0 000-8zm-6 14a6 6 0 1112 0H4z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                </div>
                                            </div>
                                        )}

                                        {/* Respuesta bot */}
                                        {res.answer && (
                                            <div className="flex gap-3 items-start">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--principal-button-color)] flex items-center justify-center shadow-sm">
                                                    <Image
                                                        src="/base/LOGO-N-WHITE.svg"
                                                        className="w-4 h-auto text-white transition-transform duration-300 group-hover:scale-110"
                                                        width={20}
                                                        height={20}
                                                        alt="Chatbot Icon"
                                                    />
                                                </div>
                                                <div
                                                    className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-gray-800 text-sm max-w-[80%] shadow-sm"
                                                >
                                                    {formatBotResponse(res.answer)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Indicador de escritura */}
                                {isTyping && <TypingIndicator />}

                                {/* Indicador de coding */}
                                {isCoding && <CodingIndicator />}

                                {/* Puntuación de satisfacción inline */}
                                {showSatisfactionInline && conversationId && (
                                    <SatisfactionInline
                                        conversationId={conversationId}
                                        onDone={() => setShowSatisfactionInline(false)}
                                    />
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className={`
                                        px-5 py-4 border-t border-[var(--secondary-border-color)] bg-[var(--principal-background-color)]
                                        ${isMobile
                                    ? "rounded-none sticky bottom-0 w-full flex-shrink-0"
                                    : "rounded-b-3xl"
                                }
                            `}>

                                {profile && showSuggested && (
                                    <div className="flex items-center gap-2 mb-3">
                                        <button
                                            className="bg-white/80 border border-gray-200 text-[var(--principal-button-color)] font-semibold px-4 py-2 rounded-2xl shadow hover:bg-white transition-colors duration-150"
                                            onClick={() => {
                                                setUserMessage(SUGGESTED_MESSAGE);
                                                setShowSuggested(false); // ocultar mensaje sugerido tras click
                                            }}
                                            type="button"
                                        >
                                            {SUGGESTED_MESSAGE}
                                        </button>
                                    </div>
                                )}



                                <div className="flex gap-3 items-end">
                                    <div className="flex-grow relative">
                                        <input
                                            type="text"
                                            placeholder="Type your question here..."
                                            value={userMessage}
                                            onChange={(e) => setUserMessage(e.target.value)}
                                            className={`
                                            w-full px-4 py-3 rounded-2xl border border-[var(--secondary-border-color)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                            placeholder:text-gray-400 text-sm text-white transition-all duration-200 pr-12
                                            ${isMobile ? "text-base py-4" : ""}
                                            `}
                                            disabled={loading || isTyping || showSatisfactionInline}
                                            onKeyDown={(e) => e.key === "Enter" && !loading && !isTyping && !showSatisfactionInline && handleSend()}
                                            autoFocus={!isMobile}
                                            inputMode="text"
                                        />
                                        {userMessage.trim() && (
                                            <button
                                                onClick={() => setUserMessage("")}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleSend()}
                                        disabled={loading || isTyping || !userMessage.trim() || showSatisfactionInline}
                                        className={`
                                            p-3 rounded-2xl font-medium transition-all duration-200 shadow-lg
                                            ${loading || isTyping || !userMessage.trim() || showSatisfactionInline
                                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                : "bg-[var(--principal-button-color)] text-white hover:shadow-xl hover:scale-105 active:scale-95"
                                            }
                                            ${isMobile ? "text-base py-4 px-4" : ""}
                                        `}
                                    >
                                        {loading ? (
                                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <g transform="rotate(90 12 12)">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                                    />
                                                </g>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ChatWidget
