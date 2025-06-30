"use client";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

interface EmailComposerProps {
  to: string;
  subject: string;
  threadId?: string;
  onClose: () => void;
}

export function EmailComposer({
  to,
  subject,
  threadId,
  onClose,
}: EmailComposerProps) {
  const sendMessageMutation = api.email.sendMessage.useMutation();

  const form = useForm({
    defaultValues: {
      to,
      subject,
      body: "",
      threadId,
    },
    onSubmit: async ({ value }) => {
      try {
        await sendMessageMutation.mutateAsync(value);
        toast.success("Email sent successfully!");
        onClose();
      } catch (error) {
        toast.error(
          "Failed to send email. Please try again. " + (error as string),
        );
      }
    },
  });

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
        {/* TODO: make these editable */}
        <div className="mb-2">
          <Input
            type="text"
            value={`To: ${to}`}
            readOnly
            disabled
            className="border-none bg-gray-50 text-black font-bold"
          />
        </div>
        <div className="mb-2">
          <Input
            type="text"
            value={`Subject: ${subject}`}
            readOnly
            disabled
            className="border-none bg-gray-50 text-black font-bold"
          />
        </div>

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
