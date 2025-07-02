"use client";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useState } from "react";

interface EmailComposerProps {
  to: string[];
  subject: string;
  body?: string;
  threadId?: string;
  onClose: () => void;
}

export function EmailComposer({
  to: initialTo,
  subject,
  body,
  threadId,
  onClose,
}: EmailComposerProps) {
  const replyMessageMutation = api.email.replyMessage.useMutation();
  const forwardMessageMutation = api.email.forwardMessage.useMutation();
  const [to, setTo] = useState<string[]>(initialTo);
  const [inputValue, setInputValue] = useState("");

  const form = useForm({
    defaultValues: {
      to,
      subject,
      body: body ?? "",
      threadId,
    },
    onSubmit: async ({ value }) => {
      try {
        if (value.threadId) {
          await replyMessageMutation.mutateAsync({
            to: value.to,
            subject: value.subject,
            body: value.body,
            threadId: value.threadId,
          });
        } else {
          await forwardMessageMutation.mutateAsync({
            to: value.to,
            subject: value.subject,
            body: value.body,
          });
        }
        toast.success("Email sent successfully!");
        onClose();
      } catch (error) {
        toast.error(
          "Failed to send email. Please try again. " + (error as string),
        );
      }
    },
  });

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue) {
      e.preventDefault();
      if (z.string().email().safeParse(inputValue).success) {
        setTo([...to, inputValue]);
        setInputValue("");
      } else {
        toast.error("Invalid email address.");
      }
    }
  };

  const removeTo = (index: number) => {
    setTo(to.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
        className="p-4"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2 bg-gray-100">
          <span className="pl-1 font-bold">To:</span>
          {to.map((email, index) => (
            <div
              key={index}
              className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-1 text-sm"
            >
              {email}
              <button
                type="button"
                onClick={() => removeTo(index)}
                className="rounded-full cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Input
            type="email"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={"Type in an email address"}
            className="flex-grow bg-transparent focus:outline-none"
          />
        </div>
        <form.Field
          name="subject"
          validators={{
            onChange: z.string().min(1, "Subject is required."),
          }}
        >
          {(field) => (
            <div className="mb-2">
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Subject"
                className="border-none font-bold text-black"
              />
            </div>
          )}
        </form.Field>

        {/* Body Field */}
        <form.Field
          name="body"
          validators={{
            onChange: z
              .string()
              .min(1, "A message body is required.")
              .max(5000, "Message is too long."),
          }}
        >
          {(field) => (
            <div className="mb-2">
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Your reply..."
                className="h-48"
              />
              {field.state.meta.errors ? (
                <em className="text-xs text-red-500">
                  {field.state.meta.errors
                    .map((error) => (error ? error.message : undefined))
                    .join(", ")}
                </em>
              ) : null}
            </div>
          )}
        </form.Field>

        <div className="flex justify-end pt-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}

